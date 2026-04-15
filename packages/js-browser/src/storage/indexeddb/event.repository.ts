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

  async getNextSequence(
    publicKey: Proto.PublicKey,
    collection: number,
    identity: string,
  ): Promise<bigint> {
    try {
      const pubKeyHex = bytesToHex(Proto.PublicKey.toBinary(publicKey));
      console.log(pubKeyHex);

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

      let maxSeq = 0n;
      for (const row of results) {
        if (
          row.publicKey === pubKeyHex &&
          row.collection === collection &&
          row.identity === identity
        ) {
          const seq = BigInt(row.sequence);
          if (seq > maxSeq) maxSeq = seq;
        }
      }

      return maxSeq + 1n;
    } catch (error) {
      throw new DatabaseError('Failed to get next sequence: ', error);
    }
  }

  async getEventsByIdentity(
    publicKey: Proto.PublicKey,
    identity: string,
  ): Promise<Proto.SignedEvent[]> {
    try {
      const pubKeyHex = bytesToHex(Proto.PublicKey.toBinary(publicKey));

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

      return results
        .filter(
          (row) => row.publicKey === pubKeyHex && row.identity === identity,
        )
        .sort((a, b) => a.sequence - b.sequence)
        .map((row) => this.toSignedEvent(row));
    } catch (error) {
      throw new DatabaseError('Failed to get events by identity: ', error);
    }
  }

  async getLatestEvent(
    publicKey: Proto.PublicKey,
    identity: string,
  ): Promise<Proto.SignedEvent | null> {
    const events = await this.getEventsByIdentity(publicKey, identity);
    return events.length > 0 ? events[events.length - 1] : null;
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

  async getHeadsByIdentity(identity: string): Promise<Proto.SignedEvent[]> {
    try {
      const transaction = this.database.createTransaction(
        IndexedDBEventRepository.STORE_NAME,
        'readonly',
      );
      const store = transaction.objectStore(
        IndexedDBEventRepository.STORE_NAME,
      );

      // Compound keyPath: [identity, publicKey, collection, sequence].
      // Reverse cursor hits the max-sequence entry for each
      // (publicKey, collection) group first. After reading a head,
      // skip the rest of the group by continuing to
      // [identity, publicKey, collection] (without sequence) — this
      // compares less than any key with a sequence component, so the
      // reverse cursor jumps to the previous group's max.
      const range = IDBKeyRange.bound([identity], [identity, '\uffff']);
      const heads: PersistedEvent[] = [];

      await new Promise<void>((resolve, reject) => {
        const request = store.openCursor(range, 'prev');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve();
            return;
          }
          const row = cursor.value as PersistedEvent;
          heads.push(row);
          // Skip to the previous group's max entry.
          cursor.continue([identity, row.publicKey, row.collection]);
        };
      });

      return heads.map((row) => this.toSignedEvent(row));
    } catch (error) {
      throw new DatabaseError('Failed to get heads by identity: ', error);
    }
  }
}
