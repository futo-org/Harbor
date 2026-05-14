import { sql, type SQL } from 'drizzle-orm';
import { v2 as Proto, type IEventRepository } from '@polycentric/js-core';
import type { SqliteDb } from '../database.js';

interface EventRow {
  signature: Uint8Array;
  event_bytes: Uint8Array;
}

const toSignedEvent = (row: EventRow): Proto.SignedEvent =>
  Proto.SignedEvent.create({
    signature: row.signature,
    eventBytes: row.event_bytes,
  });

export class EventRepository implements IEventRepository {
  constructor(private readonly db: SqliteDb) {}

  async save(signed: Proto.SignedEvent | Proto.SignedEvent[]): Promise<void> {
    const list = Array.isArray(signed) ? signed : [signed];
    if (list.length === 0) return;

    for (const s of list) {
      const ev = Proto.Event.fromBinary(s.eventBytes);
      if (!ev.key) throw new Error('Event missing key');
      if (!ev.key.signedBy?.key) throw new Error('Event key missing signedBy');
      const publicKeyBytes = Proto.PublicKey.toBinary(ev.key.signedBy);

      await this.db.run(sql`
        INSERT INTO events (identity, public_key_bytes, collection, sequence, signature, event_bytes)
        VALUES (${ev.key.identity}, ${publicKeyBytes}, ${ev.key.collection}, ${Number(ev.key.sequence)}, ${s.signature}, ${s.eventBytes})
        ON CONFLICT(identity, public_key_bytes, collection, sequence) DO UPDATE SET
          signature = excluded.signature,
          event_bytes = excluded.event_bytes
      `);
    }
  }

  async getAll(): Promise<Proto.SignedEvent[]> {
    const rows = await this.db.all<EventRow>(sql`
      SELECT signature, event_bytes FROM events
    `);
    return rows.map(toSignedEvent);
  }

  async getBatch(
    batchSize: number,
    offset = 0,
  ): Promise<{ events: Proto.SignedEvent[]; offset: number }> {
    const rows = await this.db.all<EventRow>(sql`
      SELECT signature, event_bytes FROM events
      LIMIT ${batchSize} OFFSET ${offset}
    `);
    const events = rows.map(toSignedEvent);
    return { events, offset: offset + events.length };
  }

  async getByEventKey(key: Proto.EventKey): Promise<Proto.SignedEvent | null> {
    if (!key.signedBy?.key) return null;
    const publicKeyBytes = Proto.PublicKey.toBinary(key.signedBy);

    const rows = await this.db.all<EventRow>(sql`
      SELECT signature, event_bytes FROM events
      WHERE identity = ${key.identity}
        AND public_key_bytes = ${publicKeyBytes}
        AND collection = ${key.collection}
        AND sequence = ${Number(key.sequence)}
      LIMIT 1
    `);
    return rows[0] ? toSignedEvent(rows[0]) : null;
  }

  async getByIdentity(
    identity: string,
    options?: {
      signer?: Proto.PublicKey;
      collection?: number;
      headsOnly?: boolean;
    },
  ): Promise<Proto.SignedEvent[]> {
    const conditions: SQL[] = [sql`identity = ${identity}`];
    if (options?.signer?.key) {
      conditions.push(
        sql`public_key_bytes = ${Proto.PublicKey.toBinary(options.signer)}`,
      );
    }
    if (options?.collection !== undefined) {
      conditions.push(sql`collection = ${options.collection}`);
    }
    const where = sql.join(conditions, sql` AND `);

    const query = options?.headsOnly
      ? sql`
          SELECT signature, event_bytes FROM (
            SELECT signature, event_bytes,
              ROW_NUMBER() OVER (
                PARTITION BY public_key_bytes, collection
                ORDER BY sequence DESC
              ) AS rn
            FROM events
            WHERE ${where}
          ) WHERE rn = 1
        `
      : sql`
          SELECT signature, event_bytes FROM events
          WHERE ${where}
        `;

    const rows = await this.db.all<EventRow>(query);
    return rows.map(toSignedEvent);
  }
}
