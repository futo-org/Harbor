import type { IProcessStateRepository } from '@polycentric/js-core';
import { DatabaseError } from '@polycentric/js-core';
import {
  IndexedDBDatabase,
  IndexedDBDatabaseLayout,
} from './indexedDB-database';

interface PersistedProcessState {
  system_key_type: number; // We are never going to have more key types than the number type can support, so this field can just be a number
  system_key: Uint8Array;
  process: Uint8Array;
  logical_clock: bigint;
}

/**
 * IndexedDBProcessStateRepository provides SQL-based storage for the logical clock
 * of a given process.
 */
export class IndexedDBProcessStateRepository implements IProcessStateRepository {
  private readonly database: IndexedDBDatabase;

  private static readonly STORE_NAME = 'process_state';

  /**
   * Adds the stores that this repository needs to an IndexedDBDatabaseLayout object
   */
  static createNeededStores(layout: IndexedDBDatabaseLayout) {
    layout.stores.push({
      name: IndexedDBProcessStateRepository.STORE_NAME,
      options: {
        keyPath: ['system_key_type', 'system_key', 'process'],
      },
      indexes: [],
    });
  }

  /**
   * Create a new IndexedDBProcessStateRepository instance
   *
   * @param database - Database instance
   */
  constructor(database: IndexedDBDatabase) {
    this.database = database;
  }

  /**
   * Persist the logical clock for a given process.
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @param logicalClock - The logical clock value to persist
   * @throws {DatabaseError} If the operation fails
   */
  async persistCurrentLogicalClock(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    logicalClock: bigint,
  ): Promise<void> {
    if (!(systemKeyType >= 0 && process.length === 16 && logicalClock >= 0)) {
      throw new DatabaseError('Invalid process state');
    }

    const processStateToPersist: PersistedProcessState = {
      system_key_type: Number(systemKeyType),
      system_key: systemKey,
      process: process,
      logical_clock: logicalClock,
    };

    try {
      const transaction = this.database.createTransaction(
        IndexedDBProcessStateRepository.STORE_NAME,
        'readwrite',
      );
      const store = transaction.objectStore(
        IndexedDBProcessStateRepository.STORE_NAME,
      );

      await IndexedDBDatabase.requestAsPromise(
        store.put(processStateToPersist),
      );
      transaction.commit();
    } catch (error) {
      throw new DatabaseError('Failed to set logical clock: ', error);
    }
  }

  /**
   * Get the current logical clock for a given process.
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @returns Promise that resolves to the current logical clock or 0 if not found
   * @throws {DatabaseError} If the query fails
   */
  async getCurrentLogicalClock(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
  ): Promise<bigint> {
    try {
      const transaction = this.database.createTransaction(
        IndexedDBProcessStateRepository.STORE_NAME,
        'readonly',
      );
      const store = transaction.objectStore(
        IndexedDBProcessStateRepository.STORE_NAME,
      );

      const result =
        await IndexedDBDatabase.requestAsPromise<PersistedProcessState>(
          store.get([Number(systemKeyType), systemKey, process]),
        );

      if (!result) {
        return 0n;
      }

      return result.logical_clock;
    } catch (error) {
      throw new DatabaseError('Failed to get current logical clock: ', error);
    }
  }

  /**
   * Convenience method to determine the next logical clock for a given process.
   *
   * Note: This method does not persist the new logical clock value.
   * Use persistCurrentLogicalClock to persist the new logical clock value.
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @returns Promise that resolves to the next logical clock value
   * @throws {DatabaseError} If the operation fails
   */
  async getNextLogicalClock(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
  ): Promise<bigint> {
    try {
      const currentLogicalClock = await this.getCurrentLogicalClock(
        systemKeyType,
        systemKey,
        process,
      );

      return currentLogicalClock + 1n;
    } catch (error) {
      throw new DatabaseError(
        `Failed to get next logical clock: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }
}
