import type { IEventRepository } from '@polycentric/js-core';
import { SignedEvent, DatabaseError } from '@polycentric/js-core';
import {
  IndexedDBDatabase,
  IndexedDBDatabaseLayout,
} from './indexedDB-database';

/**
 * IndexedDBEventRepository provides IndexedDB-based storage for polycentric signed events.
 */
export class IndexedDBEventRepository implements IEventRepository {
  private readonly database: IndexedDBDatabase;

  private static readonly STORE_NAME = 'events';

  /**
   * Adds the stores that this repository needs to an IndexedDBDatabaseLayout object
   */
  static createNeededStores(layout: IndexedDBDatabaseLayout) {
    layout.stores.push({
      name: IndexedDBEventRepository.STORE_NAME,
      options: {
        keyPath: 'id',
        autoIncrement: true,
      },
      indexes: [],
    });
  }

  /**
   * Create a new IndexedDBEventRepository instance
   *
   * @param database - Database instance
   */
  constructor(database: IndexedDBDatabase) {
    this.database = database;
  }

  /**
   * Persist a single event in the database.
   *
   * @param signedEvent - A signed event to persist
   * @throws {DatabaseError} If the event is invalid or persisting fails
   */
  async persistEvent(signedEvent: SignedEvent): Promise<void> {
    try {
      //const eventToPersist = IndexedDBEventRepository.signedEventToPersistedEvent(signedEvent);

      const transaction = this.database.createTransaction(
        IndexedDBEventRepository.STORE_NAME,
        'readwrite',
      );
      const store = transaction.objectStore(
        IndexedDBEventRepository.STORE_NAME,
      );

      await IndexedDBDatabase.requestAsPromise(store.put(signedEvent));
      transaction.commit();
    } catch (error) {
      throw new DatabaseError('Failed to persist signed event: ', error);
    }
  }

  /**
   * Persist multiple events in a single database transaction.
   *
   * @param signedEvents - An array of signed events to persist
   * @throws {DatabaseError} If any event is invalid or the transaction fails
   */
  async persistEvents(signedEvents: SignedEvent[]): Promise<void> {
    for (const signedEvent of signedEvents) {
      await this.persistEvent(signedEvent);
    }
  }

  /**
   * Get all events from the repository
   *
   * @returns An array of signed events
   */
  async getAllEvents(): Promise<SignedEvent[]> {
    try {
      const transaction = this.database.createTransaction(
        IndexedDBEventRepository.STORE_NAME,
        'readonly',
      );
      const store = transaction.objectStore(
        IndexedDBEventRepository.STORE_NAME,
      );

      const result = await IndexedDBDatabase.requestAsPromise<SignedEvent[]>(
        store.getAll(),
      );

      return result.map((event: SignedEvent) => SignedEvent.create(event));
    } catch (error) {
      throw new DatabaseError('Failed to get all events: ', error);
    }
  }

  /**
   * Get events in batches, ordered by id
   *
   * @param batchSize The number of events to retrieve
   * @param offset The offset from which to start retrieving events
   * @returns An object containing an array of signed events and the new offset
   */
  async getEventsBatch(
    batchSize: number,
    offset?: number,
  ): Promise<{
    events: SignedEvent[];
    offset: number;
  }> {
    const transaction = this.database.createTransaction(
      IndexedDBEventRepository.STORE_NAME,
      'readonly',
    );
    const store = transaction.objectStore(IndexedDBEventRepository.STORE_NAME);

    // Create key range: start after lastId (exclusive) or from beginning
    const range =
      offset !== undefined
        ? IDBKeyRange.upperBound(offset, true) // true = exclusive
        : undefined;

    const events: SignedEvent[] = [];
    let lastId: number | null = null;

    return new Promise((resolve, reject) => {
      const request = store.openCursor(range, 'prev');

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && events.length < batchSize) {
          events.push(SignedEvent.create(cursor.value));
          lastId = cursor.key as number;
          cursor.continue();
        } else {
          resolve({ events, offset: lastId ?? 0 });
        }
      };

      request.onerror = () => {
        reject(new DatabaseError('Failed to get events batch', request.error));
      };
    });
  }
}
