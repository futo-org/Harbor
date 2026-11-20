import type {
  ILoginRepository,
  KeyType,
  LoginDetails,
  LoginOverview,
  LoginStatus,
} from '@polycentric/js-core';
import {
  bytesToHex,
  hexToBytes,
  LoginRepositoryError,
  v2 as Proto,
} from '@polycentric/js-core';
import { IndexedDBDatabase } from './database';

/**
 * Stored representation of a login in IndexedDB.
 */
interface LoginEntry {
  identity: string;
  keyType: number;
  publicKeyHex: string;
  status: string;
  privateKeyLocation: string;
  privateKeyHex?: string;
  privateKeyToken?: string;
}

/**
 * IndexedDBLoginRepository provides IndexedDB-based storage for logins.
 *
 * Inputs are trusted; validation is the responsibility of the login store.
 */
export class IndexedDBLoginRepository implements ILoginRepository {
  private readonly database: IndexedDBDatabase;

  private static readonly STORE_NAME = 'logins';
  private static readonly STATUS_INDEX = 'idx_logins_status';

  constructor(database: IndexedDBDatabase) {
    this.database = database;
  }

  async putLogin(
    identity: string,
    keyType: KeyType,
    publicKey: Uint8Array,
    privateKey: Uint8Array,
    status: LoginStatus,
  ): Promise<void> {
    const entry: LoginEntry = {
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
      throw toLoginRepositoryError('put login', error);
    }
  }

  async changeLoginStatus(
    identity: string,
    keyType: KeyType,
    publicKey: Uint8Array,
    newStatus: LoginStatus,
  ): Promise<void> {
    try {
      const store = this.store('readwrite');

      const entry = await IndexedDBDatabase.requestAsPromise<
        LoginEntry | undefined
      >(store.get(entryKey(identity, keyType, publicKey)));

      if (!entry || entry.status === 'pendingDeletion') {
        throw new LoginRepositoryError('not found', 'login not found');
      }

      await IndexedDBDatabase.requestAsPromise(
        store.put({ ...entry, status: newStatus }),
      );

      store.transaction.commit();
    } catch (error) {
      throw toLoginRepositoryError('change login status', error);
    }
  }

  async listLogins(identity?: string): Promise<LoginOverview[]> {
    try {
      const store = this.store('readonly');

      let query: IDBKeyRange | undefined;
      if (identity) {
        query = IDBKeyRange.bound([identity], [identity, []]);
      }

      const entries = await IndexedDBDatabase.requestAsPromise<LoginEntry[]>(
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
          status: entry.status as LoginStatus,
        }));
    } catch (error) {
      throw toLoginRepositoryError('list logins', error);
    }
  }

  async getLoginDetails(
    identity: string,
    keyType: KeyType,
    publicKey: Uint8Array,
  ): Promise<LoginDetails | null> {
    try {
      const store = this.store('readonly');

      const entry = await IndexedDBDatabase.requestAsPromise<
        LoginEntry | undefined
      >(store.get(entryKey(identity, keyType, publicKey)));

      if (!entry || entry.status === 'pendingDeletion') {
        return null;
      }

      if (entry.privateKeyLocation !== 'inline') {
        throw new LoginRepositoryError(
          'unsupported key location',
          `unsupported private key location: ${entry.privateKeyLocation}`,
        );
      }

      if (entry.privateKeyHex === undefined) {
        throw new LoginRepositoryError(
          'private key storage',
          'inline private key is missing',
        );
      }

      return {
        identity: entry.identity,
        publicKey: Proto.PublicKey.create({
          keyType: entry.keyType,
          key: decodeHex(entry.publicKeyHex),
        }),
        status: entry.status as LoginStatus,
        privateKey: Proto.PrivateKey.create({
          keyType: entry.keyType,
          key: decodeHex(entry.privateKeyHex),
        }),
      };
    } catch (error) {
      throw toLoginRepositoryError('get login details', error);
    }
  }

  async deleteLogin(
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
      throw toLoginRepositoryError('delete login', error);
    }
  }

  async sweep(): Promise<void> {
    try {
      const store = this.store('readwrite');

      const keys = await IndexedDBDatabase.requestAsPromise(
        store
          .index(IndexedDBLoginRepository.STATUS_INDEX)
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
      throw toLoginRepositoryError('sweep logins', error);
    }
  }

  private store(mode: IDBTransactionMode): IDBObjectStore {
    return this.database
      .createTransaction(IndexedDBLoginRepository.STORE_NAME, mode)
      .objectStore(IndexedDBLoginRepository.STORE_NAME);
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
    throw new LoginRepositoryError('db', 'stored key has invalid hex');
  }
  return bytes;
}

function toLoginRepositoryError(
  message: string,
  error: unknown,
): LoginRepositoryError {
  if (error instanceof LoginRepositoryError) {
    return error;
  }
  if (error instanceof DOMException && error.name === 'ConstraintError') {
    return new LoginRepositoryError('already exists', `${message}: ${error}`, {
      cause: error,
    });
  }
  return new LoginRepositoryError('db', `${message}: ${error}`, {
    cause: error,
  });
}
