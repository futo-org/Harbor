/**
 * One-time import of data written by the old browser storage
 * (`@polycentric/js-browser`): events, content and logins in IndexedDB,
 * blobs in an OPFS directory. The old data is left in place; importing
 * again is harmless because everything already stored is skipped.
 */
import { bindings, type LoginStatus } from '../bindings';
import type { PolycentricClient } from '../polycentric-client';
import { hexToBytes } from '../utils/hex';

const MIGRATED = (name: string) => `harbor-migrated:${name}`;

interface OldEvent {
  signature: Uint8Array;
  eventBytes: Uint8Array;
}

interface OldContent {
  contentBytes: Uint8Array;
}

interface OldLogin {
  identity: string;
  keyType: number;
  status: string;
  privateKeyLocation: string;
  privateKeyHex?: string;
}

interface OldActiveLogin {
  identity: string;
  publicKey: { keyType: number; key: Uint8Array };
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function oldDatabaseExists(name: string): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  if (indexedDB.databases) {
    const databases = await indexedDB.databases();
    return databases.some((d) => d.name === name);
  }
  return true;
}

function readAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  if (!db.objectStoreNames.contains(store)) return Promise.resolve([]);
  return request(
    db.transaction(store, 'readonly').objectStore(store).getAll(),
  ) as Promise<T[]>;
}

const buffer = (bytes: Uint8Array) => bytes.slice().buffer as ArrayBuffer;

/** The old store's status strings. */
function loginStatus(status: string): LoginStatus | undefined {
  const S = bindings().LoginStatus;
  const map: Record<string, LoginStatus> = {
    pendingSignup: S.PendingSignup,
    pendingPair: S.PendingPair,
    pendingRecovery: S.PendingRecovery,
    liveRotationKey: S.LiveRotationKey,
    liveSigningKey: S.LiveSigningKey,
    revoked: S.Revoked,
  };
  return map[status];
}

async function importIndexedDb(
  client: PolycentricClient,
  name: string,
): Promise<void> {
  if (!(await oldDatabaseExists(name))) return;
  const open = indexedDB.open(name);
  let created = false;
  open.onupgradeneeded = () => {
    // It didn't exist after all; don't leave an empty one behind.
    created = true;
  };
  const db = await request(open);
  if (created) {
    db.close();
    indexedDB.deleteDatabase(name);
    return;
  }

  try {
    const [events, contents, logins, state] = await Promise.all([
      readAll<OldEvent>(db, 'events'),
      readAll<OldContent>(db, 'content'),
      readAll<OldLogin>(db, 'logins'),
      readAll<{ name: string } & OldActiveLogin>(db, 'loginState'),
    ]);
    const active = state.find((s) => s.name === 'activeLogin');

    await client.importLegacyData({
      events: events.map((e) => ({
        signature: buffer(e.signature),
        eventBytes: buffer(e.eventBytes),
      })),
      contents: contents.map((c) => buffer(c.contentBytes)),
      logins: logins.flatMap((l) => {
        const privateKey = l.privateKeyHex && hexToBytes(l.privateKeyHex);
        const status = loginStatus(l.status);
        if (l.privateKeyLocation !== 'inline' || !privateKey || !status) {
          return [];
        }
        return [
          {
            identity: l.identity,
            keyType: l.keyType,
            privateKey: buffer(privateKey),
            status,
          },
        ];
      }),
      active: active
        ? {
            identity: active.identity,
            publicKey: {
              keyType: active.publicKey.keyType,
              key: buffer(active.publicKey.key),
            },
          }
        : undefined,
    });
  } finally {
    db.close();
  }
}

/** Blobs the old OPFS file store kept under `{name}-blobs/`. They're
 * content-addressed, so committing them again stores them under the same
 * digest. */
async function importBlobs(
  client: PolycentricClient,
  name: string,
): Promise<void> {
  if (!navigator.storage?.getDirectory) return;
  const root = await navigator.storage.getDirectory();
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await root.getDirectoryHandle(`${name}-blobs`);
  } catch {
    return;
  }
  const entries = (
    dir as unknown as {
      entries(): AsyncIterable<[string, FileSystemHandle]>;
    }
  ).entries();
  for await (const [key, handle] of entries) {
    if (handle.kind !== 'file') continue;
    try {
      const file = await (handle as FileSystemFileHandle).getFile();
      await client.commitBlob(
        await file.arrayBuffer(),
        file.type || 'application/octet-stream',
      );
    } catch (error) {
      console.warn(`Skipping blob ${key}:`, error);
    }
  }
}

/** Import the old browser storage named `name`, once. */
export async function migrateLegacyWebStorage(
  client: PolycentricClient,
  name: string,
): Promise<void> {
  try {
    if (localStorage.getItem(MIGRATED(name))) return;
  } catch {
    return;
  }
  try {
    await importIndexedDb(client, name);
    await importBlobs(client, name);
    localStorage.setItem(MIGRATED(name), String(Date.now()));
  } catch (error) {
    // Leave the flag unset so the next start tries again.
    console.error('Migrating old browser storage failed:', error);
  }
}
