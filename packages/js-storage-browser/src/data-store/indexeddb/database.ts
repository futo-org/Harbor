import { DatabaseError } from '@polycentric/js-core';
import { DATABASE_VERSION, onUpgradeNeeded } from './migrations';
import { requestAsPromise } from './request';

/**
 * indexedDB database implementation
 */
export class IndexedDBDatabase {
  private readonly databaseName: string;

  private database: IDBDatabase | null = null;

  /**
   * Create a new indexedDB database
   *
   * @param databaseName - The name of the database
   * @throws {DatabaseError} if database name is empty
   */
  constructor(databaseName: string) {
    if (!databaseName || databaseName.trim().length === 0) {
      throw new DatabaseError('Database name cannot be empty');
    }
    if (!window?.indexedDB) {
      throw new DatabaseError('IndexedDB is not supported in this browser');
    }

    this.databaseName = databaseName;
  }

  /**
   * Initialize the database connection
   *
   * @throws {DatabaseError} if initialization fails
   */
  async initialize(): Promise<void> {
    if (this.database) {
      return; // Already initialized
    }

    this.database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(
        this.databaseName,
        DATABASE_VERSION,
      );

      // Capture errors here since they originate from event callback handlers.
      let upgradeError: unknown;

      request.onupgradeneeded = (event) => {
        try {
          onUpgradeNeeded(event).catch((error) => {
            upgradeError = error;
          });
        } catch (error) {
          upgradeError = error;
        }
      };

      request.onblocked = () => {
        console.warn(
          `Upgrade of database '${this.databaseName}' is blocked by another open connection`,
        );
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(
          new DatabaseError(
            'Failed to open database',
            upgradeError ?? request.error,
          ),
        );
      };
    });

    this.database.onversionchange = () => this.close();
  }

  /**
   * Creates and returns a transaction
   *
   * This method serves as an async wrapper over the IDBDatabase.transaction method
   */
  createTransaction(
    storeNames: string | Iterable<string>,
    mode?: IDBTransactionMode,
    options?: IDBTransactionOptions,
  ): IDBTransaction {
    if (!this.database) {
      throw new DatabaseError('Database not initialized');
    }

    return this.database.transaction(storeNames, mode, options);
  }

  /**
   * Wraps an IDBRequest in a promise
   */
  static async requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
    return requestAsPromise(request);
  }

  /**
   * Close the database connection
   *
   * @throws {DatabaseError} if database close fails
   */
  close() {
    if (!this.database) {
      // Already closed, this is ok
      return;
    }

    try {
      this.database.close();
    } catch (error) {
      throw new DatabaseError(
        `Failed to close database '${this.databaseName}': ${error}`,
        error,
      );
    } finally {
      this.database = null;
    }
  }

  /**
   * Delete a database file from OPFS
   *
   * @param name - Name of the database to delete (without .sqlite3 extension)
   * @throws {DatabaseError} if database deletion fails
   */
  static async deleteDatabase(name: string): Promise<void> {
    try {
      const request = window.indexedDB.deleteDatabase(name);
      await IndexedDBDatabase.requestAsPromise(request);
    } catch (error) {
      throw new DatabaseError(
        `Failed to delete database '${name}' from IndexedDB`,
        error,
      );
    }
  }

  /**
   * Check if the database is initialized
   */
  get initialized(): boolean {
    return !!this.database;
  }

  /**
   * Get the database name
   */
  get name(): string {
    return this.databaseName;
  }
}
