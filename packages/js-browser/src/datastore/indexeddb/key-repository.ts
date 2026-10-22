import type {
  IKeyRepository,
  KeyPairStatus,
  KeyType,
  PersistedKey,
  PrivateKey,
} from '@polycentric/js-core';
import {
  bytesToHex,
  hexToBytes,
  KeyRepositoryError,
  v2 as Proto,
} from '@polycentric/js-core';
import { IndexedDBDatabase } from './database';

/**
 * Stored representation of a key pair in IndexedDB.
 */
interface KeyEntry {
  identity: string;
  keyType: number;
  publicKeyHex: string;
  status: string;
  privateKeyLocation: string;
  privateKeyHex?: string;
  privateKeyToken?: string;
}

/**
 * IndexedDBKeyRepository provides IndexedDB-based storage for key pairs.
 *
 * Inputs are trusted; validation is the responsibility of the key store.
 */
export class IndexedDBKeyRepository implements IKeyRepository {
  private readonly database: IndexedDBDatabase;

  private static readonly STORE_NAME = 'keys';
  private static readonly STATUS_INDEX = 'idx_keys_status';

  constructor(database: IndexedDBDatabase) {
    this.database = database;
  }

  async putKeyPair(
    identity: string,
    keyType: KeyType,
    publicKey: Uint8Array,
    privateKey: Uint8Array,
    status: KeyPairStatus,
  ): Promise<void> {
    if (status === 'pendingDeletion') {
      throw new KeyRepositoryError(
        'invalid status',
        'put key pair: pendingDeletion',
      );
    }

    const entry: KeyEntry = {
      identity,
      keyType,
      publicKeyHex: bytesToHex(publicKey),
      status,
      privateKeyLocation: 'inline',
      privateKeyHex: bytesToHex(privateKey),
    };

    try {
      const store = this.store('readwrite');
      await IndexedDBDatabase.requestAsPromise(store.add(entry));
      store.transaction.commit();
    } catch (error) {
      throw toKeyRepositoryError('put key pair', error);
    }
  }

  async changeKeyStatus(
    identity: string,
    keyType: KeyType,
    publicKey: Uint8Array,
    newStatus: KeyPairStatus,
  ): Promise<void> {
    if (newStatus === 'pendingDeletion') {
      throw new KeyRepositoryError(
        'invalid status',
        'change key status: pendingDeletion',
      );
    }

    try {
      const store = this.store('readwrite');

      const entry = await IndexedDBDatabase.requestAsPromise<
        KeyEntry | undefined
      >(store.get(entryKey(identity, keyType, publicKey)));

      if (!entry || entry.status === 'pendingDeletion') {
        throw new KeyRepositoryError('not found', 'key pair not found');
      }

      await IndexedDBDatabase.requestAsPromise(
        store.put({ ...entry, status: newStatus }),
      );

      store.transaction.commit();
    } catch (error) {
      throw toKeyRepositoryError('change key status', error);
    }
  }

  async listKeys(identity?: string): Promise<PersistedKey[]> {
    try {
      const store = this.store('readonly');

      let query: IDBKeyRange | undefined;
      if (identity) {
        query = IDBKeyRange.bound([identity], [identity, []]);
      }

      const entries = await IndexedDBDatabase.requestAsPromise<KeyEntry[]>(
        store.getAll(query),
      );

      return entries
        .filter((entry) => entry.status !== 'pendingDeletion')
        .map((entry) => ({
          publicKey: Proto.PublicKey.create({
            keyType: entry.keyType,
            key: decodeHex(entry.publicKeyHex),
          }),
          identity: entry.identity,
          status: entry.status as KeyPairStatus,
        }));
    } catch (error) {
      throw toKeyRepositoryError('list keys', error);
    }
  }

  async getPrivateKey(
    identity: string,
    keyType: KeyType,
    publicKey: Uint8Array,
  ): Promise<PrivateKey | null> {
    try {
      const store = this.store('readonly');

      const entry = await IndexedDBDatabase.requestAsPromise<
        KeyEntry | undefined
      >(store.get(entryKey(identity, keyType, publicKey)));

      if (!entry || entry.status === 'pendingDeletion') {
        return null;
      }

      if (entry.privateKeyLocation !== 'inline') {
        throw new KeyRepositoryError(
          'unsupported key location',
          `unsupported private key location: ${entry.privateKeyLocation}`,
        );
      }

      return {
        keyType: entry.keyType,
        key: decodeHex(entry.privateKeyHex ?? ''),
      };
    } catch (error) {
      throw toKeyRepositoryError('get private key', error);
    }
  }

  async deleteKeyPair(
    identity: string,
    keyType: KeyType,
    publicKey: Uint8Array,
  ): Promise<void> {
    try {
      const store = this.store('readwrite');

      await IndexedDBDatabase.requestAsPromise(
        store.delete(entryKey(identity, keyType, publicKey)),
      );

      store.transaction.commit();
    } catch (error) {
      throw toKeyRepositoryError('delete key pair', error);
    }
  }

  async sweep(): Promise<void> {
    try {
      const store = this.store('readwrite');

      const keys = await IndexedDBDatabase.requestAsPromise(
        store
          .index(IndexedDBKeyRepository.STATUS_INDEX)
          .getAllKeys('pendingDeletion'),
      );

      // TODO: real deletion logic for secure storage keys when they're supported
      await Promise.all(
        keys.map((key) =>
          IndexedDBDatabase.requestAsPromise(store.delete(key)),
        ),
      );

      store.transaction.commit();
    } catch (error) {
      throw toKeyRepositoryError('sweep keys', error);
    }
  }

  private store(mode: IDBTransactionMode): IDBObjectStore {
    return this.database
      .createTransaction(IndexedDBKeyRepository.STORE_NAME, mode)
      .objectStore(IndexedDBKeyRepository.STORE_NAME);
  }
}

function entryKey(
  identity: string,
  keyType: KeyType,
  publicKey: Uint8Array,
): IDBValidKey {
  return [identity, keyType, bytesToHex(publicKey)];
}

function decodeHex(hex: string): Uint8Array {
  const bytes = hexToBytes(hex);
  if (!bytes) {
    throw new KeyRepositoryError('db', 'stored key has invalid hex');
  }
  return bytes;
}

function toKeyRepositoryError(
  message: string,
  error: unknown,
): KeyRepositoryError {
  if (error instanceof KeyRepositoryError) {
    return error;
  }
  if (error instanceof DOMException && error.name === 'ConstraintError') {
    return new KeyRepositoryError('already exists', `${message}: ${error}`, {
      cause: error,
    });
  }
  return new KeyRepositoryError('db', `${message}: ${error}`, {
    cause: error,
  });
}
