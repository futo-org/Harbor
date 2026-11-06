import type {
  IEventRepository,
  FileStoreEntry,
  IFileStoreDriver,
  ILoginRepository,
  IStorageDriver,
} from '../platform-interfaces';
import type {
  EventKey,
  EventRow,
} from '../platform-interfaces/event-repository';
import { EventRepositoryError } from '../platform-interfaces/event-repository';
import { FileStoreError } from '../platform-interfaces/file-store-driver';
import { segmentsFromPath } from '../utils/path';
import type {
  LoginDetails,
  LoginId,
  LoginOverview,
  LoginStatus,
} from '../platform-interfaces/login-repository';
import { LoginRepositoryError } from '../platform-interfaces/login-repository';
import * as Proto from '../proto/v2';
import { bytesToHex } from '../utils/hex';

/** Canonical string identity of an EventKey, used as the store's map key. */
function eventKeyString(key: EventKey): string {
  return `${key.collection}|${key.identity}|${key.signedBy.keyType}:${bytesToHex(
    key.signedBy.key,
  )}|${key.sequence}`;
}

/** Copy an event key to avoid aliasing. */
function copyEventKey(key: EventKey): EventKey {
  return {
    ...key,
    signedBy: Proto.PublicKey.create({
      keyType: key.signedBy.keyType,
      key: key.signedBy.key.slice(),
    }),
  };
}

/** Copy an event row to avoid aliasing. */
function copyRow(row: EventRow): EventRow {
  return {
    ...row,
    eventKey: copyEventKey(row.eventKey),
    eventBytes: row.eventBytes.slice(),
    eventSignature: row.eventSignature.slice(),
    contentBytes: row.contentBytes?.slice(),
  };
}

class MemoryEventRepository implements IEventRepository {
  private readonly owners = new Map<string, Map<string, EventRow>>();

  /** Get the stored row for an event, throwing if it is not present. */
  private require(owner: string, eventKey: EventKey): EventRow {
    const row = this.owners.get(owner)?.get(eventKeyString(eventKey));
    if (!row) throw new EventRepositoryError('not found', 'event not found');
    return row;
  }

  async insert(row: EventRow): Promise<void> {
    let rows = this.owners.get(row.owner);
    if (!rows) {
      rows = new Map();
      this.owners.set(row.owner, rows);
    }

    const key = eventKeyString(row.eventKey);
    if (rows.has(key)) {
      throw new EventRepositoryError('already exists', 'event already exists');
    }

    rows.set(key, copyRow(row));
  }

  async addContent(
    owner: string,
    eventKey: EventKey,
    serializedContent: Uint8Array,
  ): Promise<void> {
    const row = this.require(owner, eventKey);
    row.contentStatus = 'present';
    row.contentBytes = serializedContent.slice();
  }

  async deleteContent(owner: string, eventKey: EventKey): Promise<void> {
    const row = this.require(owner, eventKey);
    row.contentStatus = 'omitted';
    row.contentBytes = undefined;
  }

  async get(owner: string, eventKey: EventKey): Promise<EventRow | null> {
    const row = this.owners.get(owner)?.get(eventKeyString(eventKey));
    return row ? copyRow(row) : null;
  }

  async getAll(owner: string): Promise<EventRow[]> {
    const rows = this.owners.get(owner)?.values();
    if (!rows) return [];

    return [...rows].map(copyRow);
  }

  async getHeads(owner: string): Promise<EventKey[]> {
    // One head (max sequence) per (collection, signer) stream.
    const heads = new Map<string, EventKey>();
    for (const { eventKey } of this.owners.get(owner)?.values() ?? []) {
      if (eventKey.identity !== owner) continue;

      const col = eventKey.collection;
      const keyType = eventKey.signedBy.keyType;
      const keyBytes = eventKey.signedBy.key;
      const stream = `${col}|${keyType}:${bytesToHex(keyBytes)}`;

      const cur = heads.get(stream);
      if (!cur || eventKey.sequence > cur.sequence) heads.set(stream, eventKey);
    }

    return [...heads.values()].map(copyEventKey);
  }
}

type StoredLogin = {
  identity: string;
  keyType: Proto.KeyType;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  status: LoginStatus;
};

/** Canonical string identity of a login, used as the store's map key. */
function loginString(
  identity: string,
  keyType: Proto.KeyType,
  publicKey: Uint8Array,
): string {
  return `${identity}|${keyType}|${bytesToHex(publicKey)}`;
}

/** Copy a login ID to avoid aliasing. */
function copyLoginId(login: LoginId): LoginId {
  return {
    identity: login.identity,
    publicKey: Proto.PublicKey.create({
      keyType: login.publicKey.keyType,
      key: login.publicKey.key.slice(),
    }),
  };
}

class MemoryLoginRepository implements ILoginRepository {
  private readonly map = new Map<string, StoredLogin>();

  async putLogin(
    identity: string,
    keyType: Proto.KeyType,
    publicKey: Uint8Array,
    privateKey: Uint8Array,
    status: LoginStatus,
  ): Promise<void> {
    const key = loginString(identity, keyType, publicKey);

    if (this.map.has(key)) {
      throw new LoginRepositoryError('already exists', 'login already exists');
    }

    this.map.set(key, {
      identity,
      keyType,
      publicKey: publicKey.slice(),
      privateKey: privateKey.slice(),
      status,
    });
  }

  async changeLoginStatus(
    identity: string,
    keyType: Proto.KeyType,
    publicKey: Uint8Array,
    newStatus: LoginStatus,
  ): Promise<void> {
    const entry = this.map.get(loginString(identity, keyType, publicKey));

    if (!entry || entry.status === 'pendingDeletion') {
      throw new LoginRepositoryError('not found', 'login not found');
    }
    entry.status = newStatus;
  }

  async listLogins(identity?: string): Promise<LoginOverview[]> {
    const isMatchingEntry = (entry: StoredLogin) => {
      if (entry.status === 'pendingDeletion') return false;
      if (!identity) return true;
      return entry.identity === identity;
    };

    const toOutputFormat = (entry: StoredLogin): LoginOverview => ({
      identity: entry.identity,
      publicKey: Proto.PublicKey.create({
        keyType: entry.keyType,
        key: entry.publicKey,
      }),
      status: entry.status,
    });

    return [...this.map.values()].filter(isMatchingEntry).map(toOutputFormat);
  }

  async getLoginDetails(
    identity: string,
    keyType: Proto.KeyType,
    publicKey: Uint8Array,
  ): Promise<LoginDetails | null> {
    const entry = this.map.get(loginString(identity, keyType, publicKey));

    if (!entry || entry.status === 'pendingDeletion') {
      return null;
    }

    return {
      identity: entry.identity,
      publicKey: Proto.PublicKey.create({
        keyType: entry.keyType,
        key: entry.publicKey,
      }),
      status: entry.status,
      privateKey: Proto.PrivateKey.create({
        keyType: entry.keyType,
        key: entry.privateKey,
      }),
    };
  }

  async deleteLogin(
    identity: string,
    keyType: Proto.KeyType,
    publicKey: Uint8Array,
  ): Promise<void> {
    this.map.delete(loginString(identity, keyType, publicKey));
  }

  /** Delete logins that are pending deletion. */
  async sweep(): Promise<void> {
    for (const [key, entry] of this.map) {
      if (entry.status === 'pendingDeletion') {
        this.map.delete(key);
      }
    }
  }
}

/**
 * Storage driver that keeps everything in process memory. Nothing survives
 * a reload — for contexts where durable storage is unavailable (e.g.
 * private browsing blocking IndexedDB).
 */
export class MemoryStorageDriver implements IStorageDriver {
  private readonly events = new MemoryEventRepository();
  private readonly logins = new MemoryLoginRepository();
  private activeLogin: LoginId | null = null;

  createEventRepository() {
    return this.events;
  }
  createLoginRepository() {
    return this.logins;
  }

  async setActiveLogin(login: LoginId | null): Promise<void> {
    this.activeLogin = login ? copyLoginId(login) : null;
  }

  async getActiveLogin(): Promise<LoginId | null> {
    return this.activeLogin ? copyLoginId(this.activeLogin) : null;
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
