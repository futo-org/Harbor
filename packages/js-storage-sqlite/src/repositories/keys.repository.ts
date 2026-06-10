import { sql } from 'drizzle-orm';
import {
  type IKeysRepository,
  type PersistedKey,
  PublicKey,
} from '@polycentric/js-core';
import type { SqliteDb } from '../database.js';

interface SqlKeyRow {
  public_key: Uint8Array;
  key_type: number;
  private_key: Uint8Array | null;
}

export class KeysRepository implements IKeysRepository {
  constructor(private readonly db: SqliteDb) {}

  async getAllKeys(): Promise<PersistedKey[]> {
    const rows = await this.db.all<SqlKeyRow>(sql`
      SELECT
        public_key,
        key_type,
        private_key
      FROM keys
    `);
    return rows.map(toPersistedKey);
  }

  async get(publicKey: PublicKey): Promise<PersistedKey | null> {
    const row = await this.readRow(publicKey);
    if (!row) return null;
    return toPersistedKey(row);
  }

  async insert(row: PersistedKey): Promise<void> {
    await this.db.run(sql`
      INSERT INTO keys (public_key, key_type, private_key) VALUES (
        ${row.public_key},
        ${row.key_type},
        ${row.private_key ?? null}
      )
      ON CONFLICT(public_key) DO UPDATE SET
        key_type = excluded.key_type,
        private_key = excluded.private_key
    `);
  }

  async delete(publicKey: PublicKey): Promise<void> {
    await this.db.run(sql`
      DELETE FROM keys WHERE public_key = ${publicKey.key}
    `);
  }

  private async readRow(publicKey: PublicKey): Promise<SqlKeyRow | null> {
    const rows = await this.db.all<SqlKeyRow>(sql`
      SELECT
        public_key,
        key_type,
        private_key
      FROM keys
      WHERE public_key = ${publicKey.key}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }
}

function toPersistedKey(row: SqlKeyRow): PersistedKey {
  return {
    public_key: row.public_key,
    key_type: row.key_type,
    private_key: row.private_key ?? undefined,
  };
}
