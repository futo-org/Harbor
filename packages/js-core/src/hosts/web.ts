/**
 * The browser host. One dedicated worker runs the whole client for every
 * tab of the origin: rs-core's engine, its SQLite database on the origin
 * private file system, and the key cipher (a non-extractable WebCrypto key).
 *
 * OPFS's SQLite backend needs synchronous file handles, which only
 * dedicated workers get, and a database can be open in only one of them.
 * So the tab holding a Web Lock starts the worker, every tab (that one
 * included) talks to it over a BroadcastChannel, and when that tab closes
 * the next one in line for the lock starts a new worker.
 *
 * The page also loads the wasm module, for the stateless helpers (labels,
 * URLs, aliases) a UI calls while rendering.
 */
import * as wasm from '@polycentric/rs-core-wasm/web';
import { CLIENT_WORKER_SOURCE } from '@polycentric/rs-core-wasm/client-worker';
import type {
  OpenRequest,
  OpenResponse,
} from '@polycentric/rs-core-wasm/client-worker-protocol';
import { type Application, type Bindings, registerBindings } from '../bindings';
import { openLocalClient } from '../local';
import { PolycentricClient } from '../polycentric-client';
import { RemoteHarbor } from './web-remote';
import { migrateLegacyWebStorage } from './web-migration';

export interface WebClientConfig {
  /** Name of the database, shared by every tab of this origin. */
  databaseName?: string;
  seedServers?: string[];
  application?: Application;
}

/** Load the wasm module and register its bindings. Idempotent. */
export async function initWebBindings(): Promise<void> {
  await wasm.uniffiInitAsync();
  registerBindings(wasm as unknown as Bindings);
}

/** Whether this browser can run the client worker. */
function supported(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof BroadcastChannel !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.locks &&
    !!navigator.storage?.getDirectory &&
    typeof indexedDB !== 'undefined'
  );
}

/** Start the client worker, resolving once its client is open. */
async function startWorker(request: Omit<OpenRequest, 'type' | 'wasm'>) {
  const url = URL.createObjectURL(
    new Blob([CLIENT_WORKER_SOURCE], { type: 'text/javascript' }),
  );
  const worker = new Worker(url, { name: `harbor-client:${request.name}` });
  URL.revokeObjectURL(url);
  try {
    await new Promise<void>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<OpenResponse>) => {
        if (event.data.type === 'opened') resolve();
        else reject(new Error(event.data.error.message));
      };
      worker.onerror = (event) => reject(new Error(event.message));
      worker.postMessage({
        type: 'open',
        wasm: new URL(wasm.wasmUrl, location.href).href,
        ...request,
      } satisfies OpenRequest);
    });
  } catch (error) {
    worker.terminate();
    throw error;
  }
  return worker;
}

/**
 * Serve every tab from a worker this tab starts, if no other tab is.
 * Resolves `true` when this tab leads, `false` when another tab already
 * does (this one queues to take over), or `null` if the worker can't run.
 */
function lead(
  lock: string,
  request: Omit<OpenRequest, 'type' | 'wasm'>,
): Promise<boolean | null> {
  return new Promise<boolean | null>((resolve) => {
    navigator.locks
      .request(lock, { ifAvailable: true }, async (granted) => {
        if (!granted) {
          resolve(false);
          return;
        }
        try {
          await startWorker(request);
        } catch (error) {
          console.warn('Harbor client worker unavailable:', error);
          resolve(null);
          return;
        }
        resolve(true);
        // Hold the lock, and the worker, for the life of the tab.
        await new Promise(() => {});
      })
      .catch((error) => {
        console.warn('Web Locks unavailable:', error);
        resolve(null);
      });
  }).then((led) => {
    if (led === false) {
      // Take over when the leading tab closes.
      void navigator.locks.request(lock, async () => {
        try {
          await startWorker(request);
        } catch (error) {
          console.error('Could not take over the Harbor client:', error);
          return;
        }
        await new Promise(() => {});
      });
    }
    return led;
  });
}

/**
 * Keep `polycentric:activeIdentity:<identity>` in localStorage while signed
 * in, so a page can tell before the client loads (e.g. to pick a skeleton).
 */
function hintSignedIn(client: PolycentricClient): void {
  const update = () => {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith('polycentric:activeIdentity:')) {
          localStorage.removeItem(key);
        }
      }
      if (client.activeIdentityKey) {
        localStorage.setItem(
          `polycentric:activeIdentity:${client.activeIdentityKey}`,
          '1',
        );
      }
    } catch {
      // No localStorage (e.g. blocked); the hint is best-effort.
    }
  };
  update();
  client.subscribe(update);
}

/**
 * Open the client in the browser, shared by every tab. Where the browser
 * can't run it (some private browsing modes) the client runs in memory in
 * this tab, and `persistentStorage` is false.
 */
export async function createWebClient(
  config: WebClientConfig = {},
): Promise<PolycentricClient> {
  const name = (config.databaseName ?? 'polycentric').trim() || 'polycentric';
  await initWebBindings();

  try {
    if (!(await navigator.storage?.persist?.())) {
      console.warn('Persistent storage not granted; data may be evicted');
    }
  } catch (error) {
    console.warn('Persistent storage request failed:', error);
  }

  const channel = `harbor-client:${name}`;
  const led = supported()
    ? await lead(channel, {
        name,
        channel,
        seedServers: config.seedServers ?? [],
        application: config.application,
      })
    : null;

  if (led === null) {
    console.warn('Persistent storage unavailable, running in memory');
    const client = await openLocalClient({
      storage: new wasm.StorageConfig.Memory(),
      seedServers: config.seedServers,
      application: config.application,
    });
    hintSignedIn(client);
    return client;
  }

  const remote = new RemoteHarbor(new BroadcastChannel(channel));
  const client = await PolycentricClient.open(remote.harbor());
  await migrateLegacyWebStorage(client, name);
  hintSignedIn(client);
  return client;
}
