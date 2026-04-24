import type { IEventRepository } from '@polycentric/js-core';
import { v2 } from '@polycentric/js-core';
import type { Database } from './database';

export class EventRepository implements IEventRepository {
  constructor(private readonly database: Database) {}

  async save(signedEvent: v2.SignedEvent): Promise<void> {
    const event = v2.Event.fromBinary(signedEvent.eventBytes);
    if (!event.key) throw new Error('Event missing key');
    if (!event.key.signedBy?.key) throw new Error('Event key missing signedBy');

    const publicKeyBytes = v2.PublicKey.toBinary(event.key.signedBy);

    this.database.run(
      `INSERT OR REPLACE INTO events (identity, public_key_bytes, collection, sequence, signature, event_bytes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        event.key.identity,
        publicKeyBytes,
        event.key.collection,
        Number(event.key.sequence),
        signedEvent.signature,
        signedEvent.eventBytes,
      ]
    );
  }

  async getAll(): Promise<v2.SignedEvent[]> {
    const rows = this.database.execute<{
      signature: ArrayBuffer;
      event_bytes: ArrayBuffer;
    }>(`SELECT signature, event_bytes FROM events`);

    return rows.map((row) =>
      v2.SignedEvent.create({
        signature: new Uint8Array(row.signature),
        eventBytes: new Uint8Array(row.event_bytes),
      })
    );
  }

  async getBatch(
    batchSize: number,
    offset = 0
  ): Promise<{ events: v2.SignedEvent[]; offset: number }> {
    const rows = this.database.execute<{
      signature: ArrayBuffer;
      event_bytes: ArrayBuffer;
    }>(`SELECT signature, event_bytes FROM events LIMIT ? OFFSET ?`, [
      batchSize,
      offset,
    ]);

    const events = rows.map((row) =>
      v2.SignedEvent.create({
        signature: new Uint8Array(row.signature),
        eventBytes: new Uint8Array(row.event_bytes),
      })
    );

    return { events, offset: offset + events.length };
  }

  async getByEventKey(key: v2.EventKey): Promise<v2.SignedEvent | null> {
    if (!key.signedBy?.key) return null;

    const publicKeyBytes = v2.PublicKey.toBinary(key.signedBy);

    const rows = this.database.execute<{
      signature: ArrayBuffer;
      event_bytes: ArrayBuffer;
    }>(
      `SELECT signature, event_bytes FROM events
       WHERE identity = ? AND public_key_bytes = ? AND collection = ? AND sequence = ?`,
      [key.identity, publicKeyBytes, key.collection, Number(key.sequence)]
    );

    if (rows.length === 0) return null;

    const row = rows[0]!;
    return v2.SignedEvent.create({
      signature: new Uint8Array(row.signature),
      eventBytes: new Uint8Array(row.event_bytes),
    });
  }

  async getByIdentity(
    identity: string,
    options?: {
      signer?: v2.PublicKey;
      collection?: number;
      headsOnly?: boolean;
    }
  ): Promise<v2.SignedEvent[]> {
    const params: (string | Uint8Array | number)[] = [identity];
    const whereClauses = ['identity = ?'];

    if (options?.signer?.key) {
      whereClauses.push('public_key_bytes = ?');
      params.push(v2.PublicKey.toBinary(options.signer));
    }

    if (options?.collection !== undefined) {
      whereClauses.push('collection = ?');
      params.push(options.collection);
    }

    const whereClause = whereClauses.join(' AND ');

    const sql = options?.headsOnly
      ? `SELECT signature, event_bytes FROM (
          SELECT signature, event_bytes, ROW_NUMBER() OVER (PARTITION BY public_key_bytes, collection ORDER BY sequence DESC) as rn
          FROM events WHERE ${whereClause}
        ) WHERE rn = 1`
      : `SELECT signature, event_bytes FROM events WHERE ${whereClause}`;

    const rows = this.database.execute<{
      signature: ArrayBuffer;
      event_bytes: ArrayBuffer;
    }>(sql, params);

    return rows.map((row) =>
      v2.SignedEvent.create({
        signature: new Uint8Array(row.signature),
        eventBytes: new Uint8Array(row.event_bytes),
      })
    );
  }
}
