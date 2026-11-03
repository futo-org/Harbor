import type { IStorageDriver, LoginId } from '@polycentric/js-core';
import { DatabaseError, v2 as Proto } from '@polycentric/js-core';
import { IndexedDBDatabase } from './database';
import { IndexedDBLoginRepository } from './login-repository';
import { IndexedDBEventRepository } from './event.repository';
import { IndexedDBContentRepository } from './content.repository';

/**
 * Stored representation of the active login in the `loginState` store.
 */
type ActiveLoginEntry = LoginId & { name: 'activeLogin' };

export class IndexedDBStorageDriver implements IStorageDriver {
  private readonly database: IndexedDBDatabase;

  private static readonly LOGIN_STATE_STORE = 'loginState';
  private static readonly ACTIVE_LOGIN_KEY = 'activeLogin';

  private constructor(databaseName: string) {
    this.database = new IndexedDBDatabase(databaseName);
  }

  static async create(databaseName: string): Promise<IndexedDBStorageDriver> {
    const driver = new IndexedDBStorageDriver(databaseName);
    await driver.database.initialize();
    return driver;
  }

  createEventRepository() {
    return new IndexedDBEventRepository(this.database);
  }
  createContentRepository() {
    return new IndexedDBContentRepository(this.database);
  }
  createLoginRepository() {
    return new IndexedDBLoginRepository(this.database);
  }

  async setActiveLogin(login: LoginId | null): Promise<void> {
    try {
      const store = this.loginStateStore('readwrite');

      // TODO: remove this check once we support identity switching.
      // For now, we should disallow changing the active identity.
      const existingEntry = await IndexedDBDatabase.requestAsPromise<
        ActiveLoginEntry | undefined
      >(store.get(IndexedDBStorageDriver.ACTIVE_LOGIN_KEY));

      if (existingEntry) {
        throw new DatabaseError('Already logged in.');
      }

      if (login) {
        const entry: ActiveLoginEntry = {
          ...login,
          name: IndexedDBStorageDriver.ACTIVE_LOGIN_KEY,
        };

        await IndexedDBDatabase.requestAsPromise(store.put(entry));
      } else {
        await IndexedDBDatabase.requestAsPromise(
          store.delete(IndexedDBStorageDriver.ACTIVE_LOGIN_KEY),
        );
      }

      store.transaction.commit();
    } catch (error) {
      throw new DatabaseError(`set active login: ${error}`, error);
    }
  }

  async getActiveLogin(): Promise<LoginId | null> {
    try {
      const store = this.loginStateStore('readonly');

      const entry = await IndexedDBDatabase.requestAsPromise<
        ActiveLoginEntry | undefined
      >(store.get(IndexedDBStorageDriver.ACTIVE_LOGIN_KEY));

      if (!entry) {
        return null;
      }

      return {
        identity: entry.identity,
        publicKey: Proto.PublicKey.create({
          keyType: entry.publicKey.keyType,
          key: entry.publicKey.key,
        }),
      };
    } catch (error) {
      throw new DatabaseError(`get active login: ${error}`, error);
    }
  }

  private loginStateStore(mode: IDBTransactionMode): IDBObjectStore {
    return this.database
      .createTransaction(IndexedDBStorageDriver.LOGIN_STATE_STORE, mode)
      .objectStore(IndexedDBStorageDriver.LOGIN_STATE_STORE);
  }
}
