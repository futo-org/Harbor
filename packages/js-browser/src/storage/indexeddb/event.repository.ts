import type { IEventRepository } from '@polycentric/js-core';
import { DatabaseError, v2 } from '@polycentric/js-core';
import { IndexedDBDatabase, IndexedDBDatabaseLayout } from './database';

/**
 * Stored representation of an event in IndexedDB.
 * Key fields are extracted from the Event proto so IndexedDB can use them
 * as a compound keyPath for natural ordering.
 */
interface PersistedEvent {
  /** Hex-encoded public key of the signer */
  publicKey: string;
  /** Stream identifier (e.g. 'feed', 'identity') */
  streamId: string;
  /** Sequence number within the stream */
  sequence: number;
  /** The raw SignedEvent proto fields */
  signature: Uint8Array;
  eventBytes: Uint8Array;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * IndexedDBEventRepository provides IndexedDB-based storage for polycentric signed events.
 *
 * Events are stored with a compound key of (publicKey, streamId, sequence)
 * so they are naturally partitioned and ordered per stream.
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
        keyPath: ['publicKey', 'streamId', 'sequence'],
      },
      indexes: [],
    });
  }

  constructor(database: IndexedDBDatabase) {
    this.database = database;
  }

  /**
   * Extract the compound key fields from a SignedEvent by decoding the inner Event.
   */
  private toPersistedEvent(signedEvent: v2.SignedEvent): PersistedEvent {
    const event = v2.Event.fromBinary(signedEvent.eventBytes);
    if (!event.key) {
      throw new DatabaseError('Event is missing key');
    }
    if (!event.key.signedBy?.key) {
      throw new DatabaseError('Event key is missing signedBy');
    }

    return {
      publicKey: bytesToHex(event.key.signedBy.key),
      streamId: event.key.streamId,
      sequence: Number(event.key.sequence),
      signature: signedEvent.signature,
      eventBytes: signedEvent.eventBytes,
    };
  }

  private toSignedEvent(persisted: PersistedEvent): v2.SignedEvent {
    return v2.SignedEvent.create({
      signature: persisted.signature,
      eventBytes: persisted.eventBytes,
    });
  }

  async persistEvent(signedEvent: v2.SignedEvent): Promise<void> {
    try {
      const persisted = this.toPersistedEvent(signedEvent);

      const transaction = this.database.createTransaction(
        IndexedDBEventRepository.STORE_NAME,
        'readwrite',
      );
      const store = transaction.objectStore(
        IndexedDBEventRepository.STORE_NAME,
      );

      await IndexedDBDatabase.requestAsPromise(store.put(persisted));
      transaction.commit();
    } catch (error) {
      throw new DatabaseError('Failed to persist signed event: ', error);
    }
  }

  async persistEvents(signedEvents: v2.SignedEvent[]): Promise<void> {
    for (const signedEvent of signedEvents) {
      await this.persistEvent(signedEvent);
    }
  }

  async getAllEvents(): Promise<v2.SignedEvent[]> {
    try {
      const transaction = this.database.createTransaction(
        IndexedDBEventRepository.STORE_NAME,
        'readonly',
      );
      const store = transaction.objectStore(
        IndexedDBEventRepository.STORE_NAME,
      );

      const results =
        await IndexedDBDatabase.requestAsPromise<PersistedEvent[]>(
          store.getAll(),
        );

      return results.map((row) => this.toSignedEvent(row));
    } catch (error) {
      throw new DatabaseError('Failed to get all events: ', error);
    }
  }

  async getNextSequence(
    publicKey: Uint8Array,
    streamId: string,
  ): Promise<bigint> {
    try {
      const pubKeyHex = bytesToHex(publicKey);

      const transaction = this.database.createTransaction(
        IndexedDBEventRepository.STORE_NAME,
        'readonly',
      );
      const store = transaction.objectStore(
        IndexedDBEventRepository.STORE_NAME,
      );

      // Use a key range to find all events for this (publicKey, streamId).
      // Compound keys are compared lexicographically, so we can bound on the
      // first two components and open a reverse cursor to find the max sequence.
      const range = IDBKeyRange.bound(
        [pubKeyHex, streamId, 0],
        [pubKeyHex, streamId, Number.MAX_SAFE_INTEGER],
      );

      return new Promise((resolve, reject) => {
        const request = store.openCursor(range, 'prev');

        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            const persisted = cursor.value as PersistedEvent;
            resolve(BigInt(persisted.sequence) + 1n);
          } else {
            resolve(1n);
          }
        };

        request.onerror = () => {
          reject(
            new DatabaseError('Failed to get next sequence', request.error),
          );
        };
      });
    } catch (error) {
      throw new DatabaseError('Failed to get next sequence: ', error);
    }
  }

  async getEventsByStream(
    publicKey: Uint8Array,
    streamId: string,
  ): Promise<v2.SignedEvent[]> {
    try {
      const pubKeyHex = bytesToHex(publicKey);

      const transaction = this.database.createTransaction(
        IndexedDBEventRepository.STORE_NAME,
        'readonly',
      );
      const store = transaction.objectStore(
        IndexedDBEventRepository.STORE_NAME,
      );

      const range = IDBKeyRange.bound(
        [pubKeyHex, streamId, 0],
        [pubKeyHex, streamId, Number.MAX_SAFE_INTEGER],
      );

      const results =
        await IndexedDBDatabase.requestAsPromise<PersistedEvent[]>(
          store.getAll(range),
        );

      return results.map((row) => this.toSignedEvent(row));
    } catch (error) {
      throw new DatabaseError('Failed to get events by stream: ', error);
    }
  }

  async getLatestEvent(
    publicKey: Uint8Array,
    streamId: string,
  ): Promise<v2.SignedEvent | null> {
    try {
      const pubKeyHex = bytesToHex(publicKey);

      const transaction = this.database.createTransaction(
        IndexedDBEventRepository.STORE_NAME,
        'readonly',
      );
      const store = transaction.objectStore(
        IndexedDBEventRepository.STORE_NAME,
      );

      const range = IDBKeyRange.bound(
        [pubKeyHex, streamId, 0],
        [pubKeyHex, streamId, Number.MAX_SAFE_INTEGER],
      );

      return new Promise((resolve, reject) => {
        const request = store.openCursor(range, 'prev');

        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            resolve(this.toSignedEvent(cursor.value as PersistedEvent));
          } else {
            resolve(null);
          }
        };

        request.onerror = () => {
          reject(
            new DatabaseError('Failed to get latest event', request.error),
          );
        };
      });
    } catch (error) {
      throw new DatabaseError('Failed to get latest event: ', error);
    }
  }

  async getEventsBatch(
    batchSize: number,
    offset?: number,
  ): Promise<{
    events: v2.SignedEvent[];
    offset: number;
  }> {
    const transaction = this.database.createTransaction(
      IndexedDBEventRepository.STORE_NAME,
      'readonly',
    );
    const store = transaction.objectStore(IndexedDBEventRepository.STORE_NAME);

    const events: v2.SignedEvent[] = [];
    let count = 0;

    return new Promise((resolve, reject) => {
      const request = store.openCursor(null, 'prev');

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || events.length >= batchSize) {
          resolve({ events, offset: count });
          return;
        }

        // Skip past offset
        if (offset !== undefined && count < offset) {
          count++;
          cursor.continue();
          return;
        }

        const persisted = cursor.value as PersistedEvent;
        events.push(this.toSignedEvent(persisted));
        count++;
        cursor.continue();
      };

      request.onerror = () => {
        reject(new DatabaseError('Failed to get events batch', request.error));
      };
    });
  }
}
