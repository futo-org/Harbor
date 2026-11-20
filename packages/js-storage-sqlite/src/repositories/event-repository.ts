import { sql } from 'drizzle-orm';
import type {
  ContentStatus,
  EventKey,
  EventRow,
  IEventRepository,
} from '@polycentric/js-core';
import {
  COLLECTION,
  EventRepositoryError,
  v2 as Proto,
} from '@polycentric/js-core';
import type { SqliteDb } from '../database.js';

interface EventKeyColumns {
  event_key_identity: string;
  event_key_public_key_type: number;
  event_key_public_key_bytes: Uint8Array;
  event_key_collection: number;
  event_key_sequence: number;
}

interface PersistedEvent extends EventKeyColumns {
  owner: string;
  event_bytes: Uint8Array;
  event_signature: Uint8Array;
  content_status: string;
  content_bytes: Uint8Array | null;
}

/**
 * EventRepository provides SQLite-based storage for events and their content.
 *
 * Inputs are trusted; validation is the responsibility of the event store.
 */
export class EventRepository implements IEventRepository {
  constructor(private readonly db: SqliteDb) {}

  async insert(row: EventRow): Promise<void> {
    try {
      const rows = await this.db.all(sql`
        INSERT INTO events (
          owner, event_key_identity, event_key_public_key_type,
          event_key_public_key_bytes, event_key_collection, event_key_sequence,
          event_bytes, event_signature, content_status, content_bytes
        )
        VALUES (
          ${row.owner}, ${row.eventKey.identity},
          ${row.eventKey.signedBy.keyType}, ${row.eventKey.signedBy.key},
          ${row.eventKey.collection}, ${persistedSequence(row.eventKey)},
          ${row.eventBytes}, ${row.eventSignature}, ${row.contentStatus},
          ${row.contentBytes ?? null}
        )
        ON CONFLICT DO NOTHING
        RETURNING 1
      `);

      if (rows.length === 0) {
        throw new EventRepositoryError(
          'already exists',
          'event already exists',
        );
      }
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
      const rows = await this.db.all(sql`
        UPDATE events
        SET content_status = 'present', content_bytes = ${serializedContent}
        WHERE ${matchesKey(owner, eventKey)}
        RETURNING 1
      `);

      if (rows.length === 0) {
        throw new EventRepositoryError('not found', 'event not found');
      }
    } catch (error) {
      throw toEventRepositoryError('add content', error);
    }
  }

  async deleteContent(owner: string, eventKey: EventKey): Promise<void> {
    try {
      const rows = await this.db.all(sql`
        UPDATE events
        SET content_status = 'omitted', content_bytes = NULL
        WHERE ${matchesKey(owner, eventKey)}
        RETURNING 1
      `);

      if (rows.length === 0) {
        throw new EventRepositoryError('not found', 'event not found');
      }
    } catch (error) {
      throw toEventRepositoryError('delete content', error);
    }
  }

  async get(owner: string, eventKey: EventKey): Promise<EventRow | null> {
    try {
      const [row] = await this.db.all<PersistedEvent>(sql`
        SELECT * FROM events
        WHERE ${matchesKey(owner, eventKey)}
        LIMIT 1
      `);

      return row ? toEventRow(row) : null;
    } catch (error) {
      throw toEventRepositoryError('get event', error);
    }
  }

  async getAll(owner: string): Promise<EventRow[]> {
    try {
      const rows = await this.db.all<PersistedEvent>(sql`
        SELECT * FROM events WHERE owner = ${owner}
      `);

      return rows.map(toEventRow);
    } catch (error) {
      throw toEventRepositoryError('get all events', error);
    }
  }

  async getHeads(owner: string): Promise<EventKey[]> {
    try {
      const rows = await this.db.all<EventKeyColumns>(sql`
        SELECT
          event_key_identity, event_key_public_key_type,
          event_key_public_key_bytes, event_key_collection,
          MAX(event_key_sequence) AS event_key_sequence
        FROM events
        WHERE owner = ${owner} AND event_key_identity = ${owner}
        GROUP BY
          event_key_public_key_type, event_key_public_key_bytes,
          event_key_collection
      `);

      return rows.map(eventKeyFrom);
    } catch (error) {
      throw toEventRepositoryError('get heads', error);
    }
  }

  async getProfiles(): Promise<EventRow[]> {
    try {
      const rows = await this.db.all<PersistedEvent>(sql`
        SELECT * FROM events
        WHERE event_key_collection IN (
            ${COLLECTION.IDENTITY}, ${COLLECTION.PROFILE}
          )
          AND owner = event_key_identity
      `);

      return rows.map(toEventRow);
    } catch (error) {
      throw toEventRepositoryError('get profiles', error);
    }
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

function matchesKey(owner: string, eventKey: EventKey) {
  return sql`
    owner = ${owner}
    AND event_key_identity = ${eventKey.identity}
    AND event_key_public_key_type = ${eventKey.signedBy.keyType}
    AND event_key_public_key_bytes = ${eventKey.signedBy.key}
    AND event_key_collection = ${eventKey.collection}
    AND event_key_sequence = ${persistedSequence(eventKey)}
  `;
}

function eventKeyFrom(row: EventKeyColumns): EventKey {
  return {
    identity: row.event_key_identity,
    signedBy: Proto.PublicKey.create({
      keyType: row.event_key_public_key_type,
      key: row.event_key_public_key_bytes,
    }),
    collection: row.event_key_collection,
    sequence: BigInt(row.event_key_sequence),
  };
}

function toEventRow(row: PersistedEvent): EventRow {
  return {
    owner: row.owner,
    eventKey: eventKeyFrom(row),
    eventBytes: row.event_bytes,
    eventSignature: row.event_signature,
    contentStatus: row.content_status as ContentStatus,
    contentBytes: row.content_bytes ?? undefined,
  };
}

function toEventRepositoryError(
  message: string,
  error: unknown,
): EventRepositoryError {
  if (error instanceof EventRepositoryError) {
    return error;
  }
  return new EventRepositoryError('db', `${message}: ${error}`, {
    cause: error,
  });
}
