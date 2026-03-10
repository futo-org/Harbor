import type { IEventAckRepository } from '@polycentric/js-core';
import { DatabaseError } from '@polycentric/js-core';
import {
  IndexedDBDatabase,
  IndexedDBDatabaseLayout,
} from './indexedDB-database';

interface PersistedEventAck {
  system_key_type: number;
  system_key: Uint8Array;
  process: Uint8Array;
  logical_clock: number;
  servers: string;
}

/**
 * IndexedDBEventAckRepository provides IndexedDB-based storage for event acknowledgments.
 */
export class IndexedDBEventAckRepository implements IEventAckRepository {
  private readonly database: IndexedDBDatabase;

  private static readonly STORE_NAME = 'event_acks';
  private static readonly idx_event_acks_natural_key =
    'idx_event_acks_natural_key';
  private static readonly idx_event_acks_server_has_ack =
    'idx_event_acks_server_has_ack';

  /**
   * Adds the stores that this repository needs to an IndexedDBDatabaseLayout object
   */
  static createNeededStores(layout: IndexedDBDatabaseLayout) {
    layout.stores.push({
      name: IndexedDBEventAckRepository.STORE_NAME,
      options: {
        keyPath: 'id',
        autoIncrement: true,
      },
      indexes: [
        {
          name: IndexedDBEventAckRepository.idx_event_acks_natural_key,
          keyPath: [
            'system_key_type',
            'system_key',
            'process',
            'logical_clock',
          ],
        },
        {
          name: IndexedDBEventAckRepository.idx_event_acks_server_has_ack,
          keyPath: [
            'system_key_type',
            'system_key',
            'process',
            'logical_clock',
            'servers',
          ],
        },
      ],
    });
  }

  /**
   * Create a new SQLEventAckRepository instance
   *
   * @param database - Database instance
   */
  constructor(database: IndexedDBDatabase) {
    this.database = database;
  }

  /**
   * Store an event acknowledgment in the database.
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @param logicalClock - The logical clock of the acknowledged event
   * @param serverUrl - The server URL that acknowledged the event
   * @throws {DatabaseError} If storing fails
   */
  async storeEventAck(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    logicalClock: bigint,
    serverUrl: string,
  ): Promise<void> {
    if (!(systemKeyType >= 0 && process.length === 16 && logicalClock >= 0)) {
      throw new DatabaseError('Invalid event acknowledgment');
    }

    try {
      const eventAck: PersistedEventAck = {
        system_key_type: Number(systemKeyType),
        system_key: systemKey,
        process: process,
        logical_clock: Number(logicalClock),
        servers: serverUrl,
      };

      const transaction = this.database.createTransaction(
        IndexedDBEventAckRepository.STORE_NAME,
        'readwrite',
      );
      const store = transaction.objectStore(
        IndexedDBEventAckRepository.STORE_NAME,
      );

      await IndexedDBDatabase.requestAsPromise(store.put(eventAck));
      transaction.commit();
    } catch (error) {
      throw new DatabaseError('Failed to store event acknowledgment: ', error);
    }
  }

  /**
   * Retrieve event acknowledgments for a specific event.
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @param logicalClock - The logical clock of the event
   * @returns Promise that resolves to an array of server URLs that acknowledged the event
   */
  async getEventAcks(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    logicalClock: bigint,
  ): Promise<string[]> {
    try {
      const transaction = this.database.createTransaction(
        IndexedDBEventAckRepository.STORE_NAME,
        'readonly',
      );
      const store = transaction.objectStore(
        IndexedDBEventAckRepository.STORE_NAME,
      );

      const results = await IndexedDBDatabase.requestAsPromise<
        PersistedEventAck[]
      >(
        store
          .index(IndexedDBEventAckRepository.idx_event_acks_natural_key)
          .getAll([
            Number(systemKeyType),
            systemKey,
            process,
            Number(logicalClock),
          ]),
      );
      return results.map((row) => row.servers);
    } catch (error) {
      throw new DatabaseError(
        'Failed to retrieve event acknowledgments: ',
        error,
      );
    }
  }

  /**
   * Check if a specific event has been acknowledged by a specific server.
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @param logicalClock - The logical clock of the event
   * @param serverUrl - The server URL to check
   * @returns Promise that resolves to true if acknowledged, false otherwise
   */
  async hasEventAck(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    logicalClock: bigint,
    serverUrl: string,
  ): Promise<boolean> {
    try {
      const transaction = this.database.createTransaction(
        IndexedDBEventAckRepository.STORE_NAME,
        'readonly',
      );
      const store = transaction.objectStore(
        IndexedDBEventAckRepository.STORE_NAME,
      );

      const results = await IndexedDBDatabase.requestAsPromise(
        store
          .index(IndexedDBEventAckRepository.idx_event_acks_server_has_ack)
          .getAll([
            Number(systemKeyType),
            systemKey,
            process,
            Number(logicalClock),
            serverUrl,
          ]),
      );

      return results.length > 0;
    } catch (error) {
      throw new DatabaseError('Failed to check event acknowledgment: ', error);
    }
  }

  /**
   * Remove event acknowledgments for a specific event.
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @param logicalClock - The logical clock of the event
   * @throws {DatabaseError} If removal fails
   */
  async removeEventAcks(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    logicalClock: bigint,
  ): Promise<void> {
    try {
      const transaction = this.database.createTransaction(
        IndexedDBEventAckRepository.STORE_NAME,
        'readonly',
      );
      const store = transaction.objectStore(
        IndexedDBEventAckRepository.STORE_NAME,
      );

      const results = await IndexedDBDatabase.requestAsPromise(
        store
          .index(IndexedDBEventAckRepository.idx_event_acks_natural_key)
          .getAll([
            Number(systemKeyType),
            systemKey,
            process,
            Number(logicalClock),
          ]),
      );

      for (const result of results) {
        await IndexedDBDatabase.requestAsPromise(store.delete(result.id));
      }

      transaction.commit();
    } catch (error) {
      throw new DatabaseError(
        'Failed to remove event acknowledgments: ',
        error,
      );
    }
  }
}
