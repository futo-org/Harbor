import { sql } from 'drizzle-orm';
import {
  type IIdentityRepository,
  type IdentityRecord,
  PublicKey,
  bytesToHex,
  hexToBytes,
} from '@polycentric/js-core';
import type { SqliteDb } from '../database.js';

interface SerializedKey {
  keyType: number;
  keyHex: string;
}

interface RecordRow {
  identity_key: string;
  held_keys: string;
  updated_at: number;
}

export class IdentityRepository implements IIdentityRepository {
  constructor(private readonly db: SqliteDb) {}

  async getRecord(identityKey: string): Promise<IdentityRecord | null> {
    const rows = await this.db.all<RecordRow>(sql`
      SELECT identity_key, held_keys, updated_at
      FROM identity_record
      WHERE identity_key = ${identityKey}
      LIMIT 1
    `);
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async saveRecord(record: IdentityRecord): Promise<void> {
    const heldKeys = serializeKeys(record.heldKeys);
    await this.db.run(sql`
      INSERT INTO identity_record (identity_key, held_keys, updated_at)
      VALUES (${record.identityKey}, ${heldKeys}, ${record.updatedAt})
      ON CONFLICT(identity_key) DO UPDATE SET
        held_keys = excluded.held_keys,
        updated_at = excluded.updated_at
    `);
  }

  async getAllRecords(): Promise<IdentityRecord[]> {
    const rows = await this.db.all<RecordRow>(sql`
      SELECT identity_key, held_keys, updated_at FROM identity_record
    `);
    return rows.map(toRecord);
  }
}

function serializeKeys(keys: PublicKey[]): string {
  const serialized: SerializedKey[] = keys.map((key) => ({
    keyType: key.keyType,
    keyHex: bytesToHex(key.key),
  }));
  return JSON.stringify(serialized);
}

function deserializeKeys(value: string): PublicKey[] {
  const parsed = JSON.parse(value) as SerializedKey[];
  return parsed.map((s) =>
    PublicKey.create({ keyType: s.keyType, key: hexToBytes(s.keyHex) }),
  );
}

function toRecord(row: RecordRow): IdentityRecord {
  return {
    identityKey: row.identity_key,
    heldKeys: deserializeKeys(row.held_keys),
    updatedAt: row.updated_at,
  };
}
