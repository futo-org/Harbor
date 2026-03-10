import type { IProcessIdRepository } from '@polycentric/js-core';
import { DatabaseError } from '@polycentric/js-core';
import { Process } from '@polycentric/js-core';
import {
  IndexedDBDatabase,
  IndexedDBDatabaseLayout,
} from './indexedDB-database';

interface PersistedProcessId {
  id: 1;
  process_id: Uint8Array;
}

/**
 * IndexedDBProcessIdentifierRepository provides IndexedDB-based storage for the device's process ID
 */
export class IndexedDBProcessIdRepository implements IProcessIdRepository {
  private readonly database: IndexedDBDatabase;

  private static readonly STORE_NAME = 'process_id';

  /**
   * Adds the stores that this repository needs to an IndexedDBDatabaseLayout object
   */
  static createNeededStores(layout: IndexedDBDatabaseLayout) {
    layout.stores.push({
      name: IndexedDBProcessIdRepository.STORE_NAME,
      options: {
        keyPath: 'id',
      },
      indexes: [],
    });
  }

  constructor(database: IndexedDBDatabase) {
    this.database = database;
  }

  async getProcessId(): Promise<Process | null> {
    try {
      const transaction = this.database.createTransaction(
        IndexedDBProcessIdRepository.STORE_NAME,
        'readonly',
      );
      const store = transaction.objectStore(
        IndexedDBProcessIdRepository.STORE_NAME,
      );

      const result =
        await IndexedDBDatabase.requestAsPromise<PersistedProcessId>(
          store.get(1),
        );

      if (!result) {
        return null;
      }

      return Process.create({ process: result.process_id });
    } catch (error) {
      throw new DatabaseError('Failed to get process identifier: ', error);
    }
  }

  async setProcessId(processId: Process): Promise<void> {
    if (!(processId.process.length === 16)) {
      throw new DatabaseError('Invalid process id');
    }

    try {
      const processIdToPersist: PersistedProcessId = {
        id: 1,
        process_id: processId.process,
      };

      const transaction = this.database.createTransaction(
        IndexedDBProcessIdRepository.STORE_NAME,
        'readwrite',
      );
      const store = transaction.objectStore(
        IndexedDBProcessIdRepository.STORE_NAME,
      );

      await IndexedDBDatabase.requestAsPromise(store.put(processIdToPersist));
      transaction.commit();
    } catch (error) {
      throw new DatabaseError('Failed to set process id: ', error);
    }
  }
}
