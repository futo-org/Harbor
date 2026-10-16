import type {
  IContentRepository,
  IEventRepository,
  FileStoreEntry,
  IFileStoreDriver,
  IKeysRepository,
  IStorageDriver,
} from './platform-interfaces';
import {
  FileStoreError,
  segmentsFromPath,
} from './platform-interfaces/file-store-driver';
import type { PrivateKey } from './polycentric-client';
import * as Proto from './proto/v2';
import { bytesToHex, toDigestKey } from './utils/hex';

/** Canonical string identity of an EventKey, used as the store's map key. */
function eventKeyString(key: Proto.EventKey): string {
  return `${key.collection}|${key.identity}|${
    key.signedBy
      ? `${key.signedBy.keyType}:${bytesToHex(key.signedBy.key)}`
      : '?'
  }|${key.sequence}`;
}

class MemoryEventRepository implements IEventRepository {
  private readonly map = new Map<string, Proto.SignedEvent>();

  async save(
    signedEvents: Proto.SignedEvent | Proto.SignedEvent[],
  ): Promise<void> {
    const list = Array.isArray(signedEvents) ? signedEvents : [signedEvents];
    for (const signedEvent of list) {
      const event = Proto.Event.fromBinary(signedEvent.eventBytes);
      if (!event.key) continue;
      this.map.set(eventKeyString(event.key), signedEvent);
    }
  }

  async getAll(): Promise<Proto.SignedEvent[]> {
    return [...this.map.values()];
  }

  async getBatch(
    batchSize: number,
    offset = 0,
  ): Promise<{ events: Proto.SignedEvent[]; offset: number }> {
    const all = [...this.map.values()];
    const events = all.slice(offset, offset + batchSize);
    return { events, offset: offset + events.length };
  }

  async getByEventKey(key: Proto.EventKey): Promise<Proto.SignedEvent | null> {
    return this.map.get(eventKeyString(key)) ?? null;
  }

  async getByIdentity(
    identity: string,
    options?: {
      signer?: Proto.PublicKey;
      collection?: number;
      headsOnly?: boolean;
    },
  ): Promise<Proto.SignedEvent[]> {
    let events = [...this.map.values()]
      .map((se) => ({ se, event: Proto.Event.fromBinary(se.eventBytes) }))
      .filter(({ event }) => event.key?.identity === identity);

    if (options?.signer) {
      const wanted = bytesToHex(options.signer.key);
      events = events.filter(
        ({ event }) =>
          event.key?.signedBy && bytesToHex(event.key.signedBy.key) === wanted,
      );
    }
    if (options?.collection != null) {
      events = events.filter(
        ({ event }) => event.key?.collection === options.collection,
      );
    }

    if (options?.headsOnly) {
      // One head (max sequence) per (collection, signer) stream.
      const heads = new Map<string, { se: Proto.SignedEvent; seq: bigint }>();
      for (const { se, event } of events) {
        if (!event.key?.signedBy) continue;
        const stream = `${event.key.collection}|${bytesToHex(
          event.key.signedBy.key,
        )}`;
        const seq = event.key.sequence;
        const cur = heads.get(stream);
        if (!cur || seq > cur.seq) heads.set(stream, { se, seq });
      }
      return [...heads.values()].map((h) => h.se);
    }

    return events
      .sort((a, b) =>
        Number((a.event.key?.sequence ?? 0n) - (b.event.key?.sequence ?? 0n)),
      )
      .map(({ se }) => se);
  }
}

class MemoryContentRepository implements IContentRepository {
  private readonly map = new Map<
    string,
    { digest: Proto.ContentDigest; content: Proto.Content }
  >();

  async save(
    digest: Proto.ContentDigest,
    content: Proto.Content,
  ): Promise<void> {
    this.map.set(toDigestKey(digest), { digest, content });
  }

  async get(digest: Proto.ContentDigest): Promise<Proto.Content | null> {
    return this.map.get(toDigestKey(digest))?.content ?? null;
  }

  async getAll(): Promise<
    { digest: Proto.ContentDigest; content: Proto.Content }[]
  > {
    return [...this.map.values()];
  }
}

type StoredKeyPair = { privateKey: PrivateKey; publicKey: Proto.PublicKey };

function publicKeyString(publicKey: Proto.PublicKey): string {
  return `${publicKey.keyType}:${bytesToHex(publicKey.key)}`;
}

class MemoryKeysRepository implements IKeysRepository {
  private readonly map = new Map<string, StoredKeyPair>();

  async storeKeys(keys: StoredKeyPair): Promise<void> {
    this.map.set(publicKeyString(keys.publicKey), keys);
  }

  async retrieveKeysByPublicKey(
    publicKey: Proto.PublicKey,
  ): Promise<StoredKeyPair | null> {
    return this.map.get(publicKeyString(publicKey)) ?? null;
  }

  async removeKeys(publicKey: Proto.PublicKey): Promise<void> {
    this.map.delete(publicKeyString(publicKey));
  }

  async getAllKeys(): Promise<StoredKeyPair[]> {
    return [...this.map.values()];
  }
}

/**
 * Storage driver that keeps everything in process memory. Nothing survives
 * a reload — for contexts where durable storage is unavailable (e.g.
 * private browsing blocking IndexedDB).
 */
export class MemoryStorageDriver implements IStorageDriver {
  private readonly events = new MemoryEventRepository();
  private readonly contents = new MemoryContentRepository();
  private readonly keys = new MemoryKeysRepository();
  private readonly activeIdentityKeys = new Map<string, string>();

  createEventRepository() {
    return this.events;
  }
  createContentRepository() {
    return this.contents;
  }
  createKeysRepository() {
    return this.keys;
  }

  async saveActiveIdentityKey(
    publicKey: Uint8Array,
    identityKey: string | null,
  ): Promise<void> {
    const key = bytesToHex(publicKey);
    if (identityKey) {
      this.activeIdentityKeys.set(key, identityKey);
    } else {
      this.activeIdentityKeys.delete(key);
    }
  }

  async loadActiveIdentityKey(publicKey: Uint8Array): Promise<string | null> {
    return this.activeIdentityKeys.get(bytesToHex(publicKey)) ?? null;
  }
}

type MemoryDirectory = Map<string, Uint8Array | MemoryDirectory>;
type MemoryLocation = { dir: MemoryDirectory; name: string };

/** In-memory counterpart of the file store driver. */
export class MemoryFileStoreDriver implements IFileStoreDriver {
  private readonly root: MemoryDirectory = new Map();

  /**
   * Walk to the directory containing `path`.
   * Creates missing directories when `create` is true.
   * Throws a `'path conflict'` error if a parent is a file.
   */
  private parentOf(path: string, create: true): MemoryLocation;
  private parentOf(path: string, create: false): MemoryLocation | null;
  private parentOf(path: string, create: boolean): MemoryLocation | null {
    const segments = segmentsFromPath(path);

    const name = segments.pop();
    if (!name) throw new FileStoreError('invalid path', 'path has no segments');

    const dir = this.dirAt(path, segments, create);
    if (!dir) return null;

    return { dir, name };
  }

  /**
   * Walk to the directory at `segments`.
   * Creates missing directories when `create` is true.
   * Returns `null` if a directory is missing and `create` is false.
   * Throws a `'path conflict'` error if it or a parent is a file.
   */
  private dirAt(
    path: string,
    segments: string[],
    create: boolean,
  ): MemoryDirectory | null {
    let dir = this.root;
    for (const segment of segments) {
      let next = dir.get(segment);

      // Create the directory if needed.
      if (!next) {
        if (!create) return null;

        next = new Map();
        dir.set(segment, next);
      }

      // Detect path conflicts.
      if (next instanceof Uint8Array) {
        throw new FileStoreError('path conflict', `not a directory: ${path}`);
      }

      dir = next;
    }

    return dir;
  }

  /**
   * Get the file contents at `path` along with its location.
   * Returns `null` if the file is not present.
   * Throws a `'path conflict'` error if it is a directory.
   */
  private fileAt(path: string): (MemoryLocation & { file: Uint8Array }) | null {
    const parent = this.parentOf(path, false);
    if (!parent) return null;

    const entry = parent.dir.get(parent.name);
    if (entry === undefined) return null;
    if (entry instanceof Map) {
      throw new FileStoreError('path conflict', `Is a directory: ${path}`);
    }

    return { ...parent, file: entry };
  }

  async has(path: string): Promise<boolean> {
    return this.fileAt(path) !== null;
  }

  async get(path: string): Promise<Uint8Array | null> {
    return this.fileAt(path)?.file.slice() ?? null;
  }

  async put(path: string, bytes: Uint8Array): Promise<void> {
    const { dir, name } = this.parentOf(path, true);

    if (dir.get(name) instanceof Map) {
      throw new FileStoreError('path conflict', `is a directory: ${path}`);
    }

    dir.set(name, bytes.slice());
  }

  async delete(path: string): Promise<boolean> {
    const found = this.fileAt(path);
    if (!found) return false;
    return found.dir.delete(found.name);
  }

  async list(path: string): Promise<FileStoreEntry[] | null> {
    const dir = this.dirAt(path, segmentsFromPath(path, true), false);
    if (!dir) return null;

    const entries: FileStoreEntry[] = [];

    for (const [name, entry] of dir) {
      entries.push({ kind: entry instanceof Map ? 'dir' : 'file', name });
    }

    return entries;
  }

  async deleteSubpath(path: string): Promise<void> {
    const parent = this.parentOf(path, false);
    if (!parent) return;

    const entry = parent.dir.get(parent.name);
    if (entry instanceof Uint8Array) {
      throw new FileStoreError('path conflict', `not a directory: ${path}`);
    }

    parent.dir.delete(parent.name);
  }
}
