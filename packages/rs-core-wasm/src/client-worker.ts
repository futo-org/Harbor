// Dedicated worker that runs the whole Harbor client for every tab of an
// origin: rs-core's engine, its SQLite database on the origin private file
// system, and the key cipher. SQLite's OPFS backend needs synchronous file
// handles, which browsers only give dedicated workers, and a database can be
// open in only one of them; so one tab (the leader, see js-core's web host)
// starts this worker and every tab talks to it over a BroadcastChannel.
//
// Bundled into a self-contained script by tools/bundle-client-worker.mjs.
import {
  type ClientEvent,
  type HarborClientLike,
  HarborClientBuilder,
  type KeyCipher,
  type QueryResult,
  StorageConfig,
  SdkError,
  uniffiInitAsync,
} from './generated/wasm/index';
import type {
  ChannelMessage,
  OpenRequest,
  OpenResponse,
  RemoteError,
} from './client-worker-protocol';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<OpenRequest>) => void) | null;
  postMessage(message: OpenResponse): void;
};

/** Things a tab refers to by id: pending events and query subscriptions. */
const handles = new Map<number, unknown>();
let nextHandle = 1;
const subscriptions = new Map<string, { unsubscribe(): void }>();

function remoteError(error: unknown): RemoteError {
  if (error instanceof Error) {
    const tag = (error as { tag?: unknown }).tag;
    return {
      name: error.name,
      message: error.message,
      tag: typeof tag === 'string' ? tag : undefined,
    };
  }
  return { name: 'Error', message: String(error) };
}

/** Whether `value` is an object the bindings hand out (not plain data). */
function isObject(value: unknown): value is { uniffiDestroy(): void } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { uniffiDestroy?: unknown }).uniffiDestroy === 'function'
  );
}

/** Swap handle references in call arguments for the objects they name. */
function resolveHandles(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (typeof arg === 'object' && arg !== null && '__handle' in arg) {
      const id = (arg as { __handle: number }).__handle;
      const object = handles.get(id);
      if (!object) throw new Error('This handle expired; prepare it again.');
      return object;
    }
    return arg;
  });
}

/**
 * Pending events cross as a handle plus what a tab may read from them.
 * Anything else the client returns is plain data.
 */
function exportValue(value: unknown): unknown {
  if (!isObject(value)) return value;
  const id = nextHandle++;
  handles.set(id, value);
  const pending = value as unknown as {
    bundle(): unknown;
    key(): unknown;
  };
  return { __handle: id, bundle: pending.bundle(), key: pending.key() };
}

// ── Key cipher ─────────────────────────────────────────────────────────

const KEY_DB = 'harbor-keys';
const KEY_STORE = 'keys';

function idb<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * The wrapping key for `name`: a non-extractable AES-GCM key kept in
 * IndexedDB. The browser never exposes its bytes, so the database alone
 * can't unseal anything.
 */
async function wrappingKey(name: string): Promise<CryptoKey> {
  const open = indexedDB.open(KEY_DB, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(KEY_STORE);
  const db = await idb(open);
  try {
    const existing = await idb<CryptoKey | undefined>(
      db.transaction(KEY_STORE).objectStore(KEY_STORE).get(name),
    );
    if (existing) return existing;
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    const tx = db.transaction(KEY_STORE, 'readwrite');
    // Keep a key another tab stored first, if it raced us.
    const store = tx.objectStore(KEY_STORE);
    const raced = await idb<CryptoKey | undefined>(store.get(name));
    if (raced) return raced;
    await idb(store.put(key, name));
    return key;
  } finally {
    db.close();
  }
}

/** Seals as `iv (12) || AES-GCM ciphertext`. */
function webCryptoCipher(key: CryptoKey): KeyCipher {
  return {
    async seal(privateKey: ArrayBuffer): Promise<ArrayBuffer> {
      try {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const sealed = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          key,
          privateKey,
        );
        const out = new Uint8Array(12 + sealed.byteLength);
        out.set(iv);
        out.set(new Uint8Array(sealed), 12);
        return out.buffer;
      } catch (error) {
        throw new SdkError.Crypto(`sealing the key failed: ${error}`);
      }
    },
    async open(sealed: ArrayBuffer): Promise<ArrayBuffer> {
      try {
        const bytes = new Uint8Array(sealed);
        return await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: bytes.slice(0, 12) },
          key,
          bytes.slice(12),
        );
      } catch (error) {
        throw new SdkError.Crypto(`the key could not be opened: ${error}`);
      }
    },
  };
}

// ── Serving ────────────────────────────────────────────────────────────

function serve(client: HarborClientLike, channel: BroadcastChannel): void {
  const post = (message: ChannelMessage) => channel.postMessage(message);
  const epoch = crypto.randomUUID();

  client.addListener({
    onEvent(event: ClientEvent) {
      post({ type: 'event', event });
    },
  });

  channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
    const message = event.data;
    switch (message.type) {
      case 'call': {
        const { id, method, args } = message;
        (async () => {
          const fn = (client as unknown as Record<string, unknown>)[method];
          if (typeof fn !== 'function') {
            throw new Error(`unknown client method: ${method}`);
          }
          const result = await (fn as (...a: unknown[]) => unknown).apply(
            client,
            resolveHandles(args),
          );
          return exportValue(result);
        })().then(
          (value) => post({ type: 'result', id, value }),
          (error) => post({ type: 'result', id, error: remoteError(error) }),
        );
        break;
      }
      case 'release':
        handles.delete(message.handle);
        break;
      case 'subscribe': {
        const { sub, queryKey, query, opts } = message;
        try {
          const subscription = client
            .fetchQuery(queryKey, query, opts)
            .subscribe({
              next: (result: QueryResult) =>
                post({ type: 'query', sub, next: result }),
              error: (error: string) => post({ type: 'query', sub, error }),
              complete: () => post({ type: 'query', sub, complete: true }),
            });
          subscriptions.get(sub)?.unsubscribe();
          subscriptions.set(sub, subscription);
        } catch (error) {
          post({ type: 'query', sub, error: remoteError(error).message });
        }
        break;
      }
      case 'unsubscribe':
        subscriptions.get(message.sub)?.unsubscribe();
        subscriptions.delete(message.sub);
        break;
      case 'hello':
        // A tab that started after we announced ourselves.
        post({ type: 'ready', epoch });
        break;
      default:
        break;
    }
  };

  post({ type: 'ready', epoch });
}

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type !== 'open') return;
  (async () => {
    await uniffiInitAsync(message.wasm);
    const builder = new HarborClientBuilder({
      storage: new StorageConfig.Opfs({ name: message.name }),
      seedServers: message.seedServers,
      application: message.application,
    });
    builder.keyCipher(webCryptoCipher(await wrappingKey(message.name)));
    const client = await builder.open();
    serve(client, new BroadcastChannel(message.channel));
  })().then(
    () => scope.postMessage({ type: 'opened' }),
    (error) => scope.postMessage({ type: 'failed', error: remoteError(error) }),
  );
};
