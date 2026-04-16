import type { IEventRepository } from '@polycentric/js-core';
import { DatabaseError, v2 as Proto } from '@polycentric/js-core';
import { IndexedDBDatabase, IndexedDBDatabaseLayout } from './database';

/**
 * Stored representation of an event in IndexedDB.
 * Key fields are extracted from the Event proto so IndexedDB can use them
 * as a compound keyPath for natural ordering.
 */
interface PersistedEvent {
  /** Hex-encoded public key of the signer */
  publicKey: string;
  /** Collection ID (1=Identity, 2=Feed, 3=Interactions) */
  collection: number;
  /** Identity key */
  identity: string;
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
 * Events are stored with a compound key of (publicKey, collection, identity, sequence)
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
        keyPath: ['identity', 'publicKey', 'collection', 'sequence'],
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
  private toPersistedEvent(signedEvent: Proto.SignedEvent): PersistedEvent {
    const event = Proto.Event.fromBinary(signedEvent.eventBytes);
    if (!event.key) {
      throw new DatabaseError('Event is missing key');
    }
    if (!event.key.signedBy?.key) {
      throw new DatabaseError('Event key is missing signedBy');
    }

    return {
      publicKey: bytesToHex(Proto.PublicKey.toBinary(event.key.signedBy)),
      collection: event.key.collection,
      identity: event.key.identity,
      sequence: Number(event.key.sequence),
      signature: signedEvent.signature,
      eventBytes: signedEvent.eventBytes,
    };
  }

  private toSignedEvent(persisted: PersistedEvent): Proto.SignedEvent {
    return Proto.SignedEvent.create({
      signature: persisted.signature,
      eventBytes: persisted.eventBytes,
    });
  }

  async save(
    signedEvents: Proto.SignedEvent | Proto.SignedEvent[],
  ): Promise<void> {
    if (Array.isArray(signedEvents)) {
      for (const signedEvent of signedEvents) {
        await this.save(signedEvent);
      }
    } else {
      const signedEvent = signedEvents;
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
  }

  async getAll(): Promise<Proto.SignedEvent[]> {
    try {
      const transaction = this.database.createTransaction(
        IndexedDBEventRepository.STORE_NAME,
        'readonly',
      );
      const store = transaction.objectStore(
        IndexedDBEventRepository.STORE_NAME,
      );

      const results = await IndexedDBDatabase.requestAsPromise<
        PersistedEvent[]
      >(store.getAll());

      return results.map((row) => this.toSignedEvent(row));
    } catch (error) {
      throw new DatabaseError('Failed to get all events: ', error);
    }
  }

  async getByEventKey(key: Proto.EventKey): Promise<Proto.SignedEvent | null> {
    if (!key.signedBy) return null;
    try {
      const transaction = this.database.createTransaction(
        IndexedDBEventRepository.STORE_NAME,
        'readonly',
      );
      const store = transaction.objectStore(
        IndexedDBEventRepository.STORE_NAME,
      );
      const pkHex = bytesToHex(Proto.PublicKey.toBinary(key.signedBy));
      const result = await IndexedDBDatabase.requestAsPromise<
        PersistedEvent | undefined
      >(store.get([key.identity, pkHex, key.collection, Number(key.sequence)]));
      return result ? this.toSignedEvent(result) : null;
    } catch (error) {
      throw new DatabaseError('Failed to get event by key: ', error);
    }
  }

  async getBatch(
    batchSize: number,
    offset?: number,
  ): Promise<{
    events: Proto.SignedEvent[];
    offset: number;
  }> {
    const all = await this.getAll();
    const start = offset ?? 0;
    const events = all.slice(start, start + batchSize);
    return { events, offset: start + events.length };
  }

  async getByIdentity(
    identity: string,
    options?: {
      signer?: Proto.PublicKey;
      collection?: number;
      headsOnly?: boolean;
    },
  ): Promise<Proto.SignedEvent[]> {
    try {
      const transaction = this.database.createTransaction(
        IndexedDBEventRepository.STORE_NAME,
        'readonly',
      );
      const store = transaction.objectStore(
        IndexedDBEventRepository.STORE_NAME,
      );

      // Compound keyPath: [identity, publicKey, collection, sequence].
      // Build the longest prefix of fixed components so the cursor scans
      // only matching rows.
      const prefix: (string | number)[] = [identity];
      if (options?.signer) {
        prefix.push(bytesToHex(Proto.PublicKey.toBinary(options.signer)));
        if (options.collection !== undefined) prefix.push(options.collection);
      }
      const range = IDBKeyRange.bound(prefix, [...prefix, []]);
      const headsOnly = options?.headsOnly ?? false;
      const collectionFilter = options?.collection;

      // headsOnly: walk in reverse; first hit per (signer, collection) is
      // its max-sequence entry, then skip the rest of the group.
      // Otherwise: walk forward and collect everything matching.
      const direction: IDBCursorDirection = headsOnly ? 'prev' : 'next';
      const rows: PersistedEvent[] = [];

      await new Promise<void>((resolve, reject) => {
        const request = store.openCursor(range, direction);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return resolve();
          const row = cursor.value as PersistedEvent;
          if (
            collectionFilter === undefined ||
            row.collection === collectionFilter
          ) {
            rows.push(row);
          }
          if (headsOnly) {
            // Skip the rest of this (signer, collection) group.
            cursor.continue([identity, row.publicKey, row.collection]);
          } else {
            cursor.continue();
          }
        };
      });

      return rows.map((row) => this.toSignedEvent(row));
    } catch (error) {
      throw new DatabaseError('Failed to get events by identity: ', error);
    }
  }
}
