import { DatabaseError } from '@polycentric/js-core';

/**
 * Information about the layout of an indexedDB database
 */
export interface IndexedDBDatabaseLayout {
  readonly version: number;
  stores: {
    readonly name: string;
    readonly options?: IDBObjectStoreParameters;
    indexes: {
      readonly name: string;
      readonly keyPath: string | Iterable<string>;
      readonly options?: IDBIndexParameters;
    }[];
  }[];
}

/**
 * indexedDB database implementation
 */
export class IndexedDBDatabase {
  private readonly databaseName: string;
  private readonly layout: IndexedDBDatabaseLayout;

  private database: IDBDatabase | null = null;

  /**
   * Create a new indexedDB database
   *
   * @param databaseName - The name of the database
   * @param schema - Optional database schema, overrides the default polycentric schema
   * @throws {DatabaseError} if database name is empty
   */
  constructor(databaseName: string, layout: IndexedDBDatabaseLayout) {
    if (!databaseName || databaseName.trim().length === 0) {
      throw new DatabaseError('Database name cannot be empty');
    }
    if (!window?.indexedDB) {
      throw new DatabaseError('IndexedDB is not supported in this browser');
    }

    this.databaseName = databaseName;
    this.layout = layout;
  }

  /**
   * Creates needed object stores, should only be called if they haven't already been created
   */
  private initializeDB(db: IDBDatabase) {
    // Drop stores that exist but have a different keyPath (schema migration)
    for (const store of this.layout.stores) {
      if (db.objectStoreNames.contains(store.name)) {
        db.deleteObjectStore(store.name);
      }
      const createdStore = db.createObjectStore(store.name, store.options);
      for (const index of store.indexes) {
        createdStore.createIndex(index.name, index.keyPath, index.options);
      }
    }
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
        this.layout.version,
      );
      request.onupgradeneeded = () => {
        this.initializeDB(request.result);
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(new DatabaseError('Failed to open database', request.error));
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
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
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

/**
 * Create a new IndexedDB database instance.
 *
 * This method creates a standalone database. It allows for
 * simpler isolation for testing purposes.
 *
 * This method should not be used in practice.
 *
 * @param databaseName - The name of the database
 * @param layout - The layout of the database (used to specify which object stores should be created)
 * @returns Promise that resolves to a new IndexedDB database instance
 */
export const _createIndexedDBDatabase = async (
  databaseName: string,
  layout: IndexedDBDatabaseLayout,
) => {
  const database = new IndexedDBDatabase(databaseName, layout);
  await database.initialize();
  return database;
};

export const _createIndexedDBDatabaseLayout = (
  storeCreators: ((layout: IndexedDBDatabaseLayout) => void)[],
): IndexedDBDatabaseLayout => {
  const layout: IndexedDBDatabaseLayout = {
    version: 2,
    stores: [],
  };

  for (const storeCreator of storeCreators) {
    storeCreator(layout);
  }

  return layout;
};
