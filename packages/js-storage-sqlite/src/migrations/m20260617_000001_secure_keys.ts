import { sql } from 'drizzle-orm';
import type { SqliteDb } from '../database.js';

export const name = 'm20260617_000001_secure_keys';

// Allow `private_key` to be NULL for keys whose private bytes live
// outside this table (e.g. expo-secure-store slot derived from the
// pubkey). Browser-side ciphertext + credential id live in IndexedDB,
// not here.
const STATEMENTS = [
  `ALTER TABLE keys RENAME TO keys_old`,
  `CREATE TABLE keys (
    public_key BLOB PRIMARY KEY,
    key_type INTEGER NOT NULL,
    private_key BLOB,
    CHECK (key_type >= 0),
    CHECK (private_key IS NULL OR LENGTH(private_key) = 32),
    CHECK (LENGTH(public_key) = 32)
  )`,
  `INSERT INTO keys (public_key, key_type, private_key)
    SELECT public_key, key_type, private_key
    FROM keys_old`,
  `DROP TABLE keys_old`,
];

export async function up(db: SqliteDb): Promise<void> {
  for (const stmt of STATEMENTS) {
    await db.run(sql.raw(stmt));
  }
}
