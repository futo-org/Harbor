import type {
  ContentStatus,
  EventKey,
  EventRow,
  IEventRepository,
  KeyType,
} from '@polycentric/js-core';
import {
  COLLECTION,
  EventRepositoryError,
  v2 as Proto,
} from '@polycentric/js-core';
import { IndexedDBDatabase } from './database';

/**
 * Stored representation of an event and its content in IndexedDB.
 */
type PersistedEvent = {
  // Key path
  owner: string;
  eventKeyIdentity: string;
  eventKeyPublicKeyType: KeyType;
  eventKeyPublicKeyBytes: Uint8Array;
  eventKeyCollection: number;
  eventKeySequence: number;

  // Other fields
  eventBytes: Uint8Array;
  eventSignature: Uint8Array;
  contentStatus: ContentStatus;
  contentBytes?: Uint8Array;
};

/**
 * IndexedDBEventRepository provides IndexedDB-based storage for events and
 * their content.
 *
 * Inputs are trusted; validation is the responsibility of the event store.
 */
export class IndexedDBEventRepository implements IEventRepository {
  private readonly database: IndexedDBDatabase;

  private static readonly STORE_NAME = 'events';
  private static readonly COLLECTION_INDEX = 'idx_events_collection';

  constructor(database: IndexedDBDatabase) {
    this.database = database;
  }

  async insert(row: EventRow): Promise<void> {
    // Copy byte arrays to ensure we don't store a larger backing buffer on
    // disk for each one.
    const entry: PersistedEvent = {
      owner: row.owner,
      eventKeyIdentity: row.eventKey.identity,
      eventKeyPublicKeyType: row.eventKey.signedBy.keyType,
      eventKeyPublicKeyBytes: row.eventKey.signedBy.key.slice(),
      eventKeyCollection: row.eventKey.collection,
      eventKeySequence: persistedSequence(row.eventKey),
      eventBytes: row.eventBytes.slice(),
      eventSignature: row.eventSignature.slice(),
      contentStatus: row.contentStatus,
      contentBytes: row.contentBytes?.slice(),
    };

    try {
      const store = this.store('readwrite');
      await IndexedDBDatabase.requestAsPromise(store.add(entry));
      store.transaction.commit();
    } catch (error) {
      throw toEventRepositoryError('insert event', error);
    }
  }

  async addContent(
    owner: string,
    eventKey: EventKey,
    serializedContent: Uint8Array,
  ): Promise<void> {
    try {
      const store = this.store('readwrite');

      const entry = await IndexedDBDatabase.requestAsPromise<
        PersistedEvent | undefined
      >(store.get(entryKey(owner, eventKey)));

      if (!entry) {
        throw new EventRepositoryError('not found', 'event not found');
      }

      const updated: PersistedEvent = {
        ...entry,
        contentStatus: 'present',
        contentBytes: serializedContent.slice(),
      };

      await IndexedDBDatabase.requestAsPromise(store.put(updated));

      store.transaction.commit();
    } catch (error) {
      throw toEventRepositoryError('add content', error);
    }
  }

  async deleteContent(owner: string, eventKey: EventKey): Promise<void> {
    try {
      const store = this.store('readwrite');

      const entry = await IndexedDBDatabase.requestAsPromise<
        PersistedEvent | undefined
      >(store.get(entryKey(owner, eventKey)));

      if (!entry) {
        throw new EventRepositoryError('not found', 'event not found');
      }

      const updated: PersistedEvent = {
        ...entry,
        contentStatus: 'omitted',
        contentBytes: undefined,
      };

      await IndexedDBDatabase.requestAsPromise(store.put(updated));
      store.transaction.commit();
    } catch (error) {
      throw toEventRepositoryError('delete content', error);
    }
  }

  async get(owner: string, eventKey: EventKey): Promise<EventRow | null> {
    try {
      const store = this.store('readonly');

      const entry = await IndexedDBDatabase.requestAsPromise<
        PersistedEvent | undefined
      >(store.get(entryKey(owner, eventKey)));

      return entry ? toEventRow(entry) : null;
    } catch (error) {
      throw toEventRepositoryError('get event', error);
    }
  }

  async getAll(owner: string): Promise<EventRow[]> {
    try {
      const store = this.store('readonly');

      const entries = await IndexedDBDatabase.requestAsPromise<
        PersistedEvent[]
      >(store.getAll(IDBKeyRange.bound([owner], [owner, []])));

      return entries.map(toEventRow);
    } catch (error) {
      throw toEventRepositoryError('get all events', error);
    }
  }

  async getHeads(owner: string): Promise<EventKey[]> {
    try {
      const store = this.store('readonly');

      // Walk backwards over events whose identity matches the owner.
      // The first entry seen for each (signer, collection) group has the
      // highest sequence, so record it and skip the rest of the group.
      const range = IDBKeyRange.bound([owner, owner], [owner, owner, []]);
      const heads: EventKey[] = [];

      await new Promise<void>((resolve, reject) => {
        const request = store.openCursor(range, 'prev');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            return resolve();
          }

          const entry = cursor.value as PersistedEvent;
          heads.push(eventKeyFrom(entry));

          // Sorts before every key in the group, which skips it in 'prev'.
          cursor.continue([
            owner,
            owner,
            entry.eventKeyPublicKeyType,
            entry.eventKeyPublicKeyBytes.slice(),
            entry.eventKeyCollection,
          ]);
        };
      });

      return heads;
    } catch (error) {
      throw toEventRepositoryError('get heads', error);
    }
  }

  async getProfiles(): Promise<EventRow[]> {
    try {
      const index = this.store('readonly').index(
        IndexedDBEventRepository.COLLECTION_INDEX,
      );

      const groups = await Promise.all(
        [COLLECTION.IDENTITY, COLLECTION.PROFILE].map((collection) =>
          IndexedDBDatabase.requestAsPromise<PersistedEvent[]>(
            index.getAll(collection),
          ),
        ),
      );

      return groups
        .flat()
        .filter((entry) => entry.owner === entry.eventKeyIdentity)
        .map(toEventRow);
    } catch (error) {
      throw toEventRepositoryError('get profiles', error);
    }
  }

  private store(mode: IDBTransactionMode): IDBObjectStore {
    return this.database
      .createTransaction(IndexedDBEventRepository.STORE_NAME, mode)
      .objectStore(IndexedDBEventRepository.STORE_NAME);
  }
}

/**
 * Require event key sequence numbers to fit in a JS number.
 */
function persistedSequence(eventKey: EventKey): number {
  if (eventKey.sequence > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new EventRepositoryError(
      'invalid event',
      `sequence ${eventKey.sequence} is too large`,
    );
  }

  return Number(eventKey.sequence);
}

function entryKey(owner: string, eventKey: EventKey): IDBValidKey {
  return [
    owner,
    eventKey.identity,
    eventKey.signedBy.keyType,
    eventKey.signedBy.key.slice(),
    eventKey.collection,
    persistedSequence(eventKey),
  ];
}

function eventKeyFrom(entry: PersistedEvent): EventKey {
  return {
    identity: entry.eventKeyIdentity,
    signedBy: Proto.PublicKey.create({
      keyType: entry.eventKeyPublicKeyType,
      key: entry.eventKeyPublicKeyBytes,
    }),
    collection: entry.eventKeyCollection,
    sequence: BigInt(entry.eventKeySequence),
  };
}

function toEventRow(entry: PersistedEvent): EventRow {
  const row: EventRow = {
    owner: entry.owner,
    eventKey: eventKeyFrom(entry),
    eventBytes: entry.eventBytes,
    eventSignature: entry.eventSignature,
    contentStatus: entry.contentStatus,
    contentBytes: entry.contentBytes,
  };

  return row;
}

function toEventRepositoryError(
  message: string,
  error: unknown,
): EventRepositoryError {
  if (error instanceof EventRepositoryError) {
    return error;
  }

  if (error instanceof DOMException && error.name === 'ConstraintError') {
    return new EventRepositoryError('already exists', `${message}: ${error}`, {
      cause: error,
    });
  }

  return new EventRepositoryError('db', `${message}: ${error}`, {
    cause: error,
  });
}
