import { sql } from 'drizzle-orm';
import type { PgExecutor } from '../database.js';

export const name = 'm20260724_000001_initial';

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL,
    upgraded_on TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS active_identity_for_key (
    public_key BYTEA PRIMARY KEY,
    identity_key TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS keys (
    public_key BYTEA PRIMARY KEY,
    key_type INTEGER NOT NULL,
    private_key BYTEA NOT NULL,
    CHECK (key_type >= 0),
    CHECK (OCTET_LENGTH(private_key) = 32),
    CHECK (OCTET_LENGTH(public_key) = 32)
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    identity TEXT NOT NULL,
    public_key_bytes BYTEA NOT NULL,
    collection INTEGER NOT NULL,
    sequence BIGINT NOT NULL,
    signature BYTEA NOT NULL,
    event_bytes BYTEA NOT NULL,
    PRIMARY KEY (identity, public_key_bytes, collection, sequence)
  )`,
  `CREATE TABLE IF NOT EXISTS content (
    digest_bytes BYTEA PRIMARY KEY,
    content_bytes BYTEA NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_identity ON events (identity)`,
  `CREATE INDEX IF NOT EXISTS idx_events_identity_signer ON events (identity, public_key_bytes)`,
  `CREATE INDEX IF NOT EXISTS idx_events_identity_signer_collection ON events (identity, public_key_bytes, collection)`,
];

export async function up(db: PgExecutor): Promise<void> {
  for (const stmt of STATEMENTS) {
    await db.execute(sql.raw(stmt));
  }
}
