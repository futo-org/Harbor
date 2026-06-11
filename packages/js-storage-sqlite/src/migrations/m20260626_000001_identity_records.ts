import { sql } from 'drizzle-orm';
import { bytesToHex } from '@polycentric/js-core';
import type { SqliteDb } from '../database.js';

export const name = 'm20260626_000001_identity_records';

interface LegacyHeldKeyRow {
  identity_key: string;
  key_type: number;
  public_key: Uint8Array;
}

/**
 * Replace the per-signing-key active identity pointer
 * (`active_identity_for_key`) with a per-identity record of the public keys
 * this client holds for it. The active identity is derived from these records
 * (most recently updated), so there is no separate active-identity slot.
 *
 * The old table maps a signing pubkey to an identity, which is exactly the
 * set of keys this client holds for that identity, so we carry it over before
 * dropping it.
 */
export async function up(db: SqliteDb): Promise<void> {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS identity_record (
      identity_key TEXT PRIMARY KEY,
      held_keys TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Build one held-keys record per identity from the old pubkey -> identity
  // mapping. held_keys is serialized as the repository's JSON form:
  // [{ "keyType": <n>, "keyHex": <lowerHexPubkey> }].
  const rows = await db.all<LegacyHeldKeyRow>(sql`
    SELECT a.identity_key, k.key_type, a.public_key
    FROM active_identity_for_key a
    JOIN keys k ON k.public_key = a.public_key
    WHERE a.identity_key IS NOT NULL
  `);

  const heldByIdentity = new Map<
    string,
    { keyType: number; keyHex: string }[]
  >();
  for (const row of rows) {
    const held = heldByIdentity.get(row.identity_key) ?? [];
    held.push({ keyType: row.key_type, keyHex: bytesToHex(row.public_key) });
    heldByIdentity.set(row.identity_key, held);
  }

  for (const [identityKey, heldKeys] of heldByIdentity) {
    await db.run(sql`
      INSERT INTO identity_record (identity_key, held_keys, updated_at)
      VALUES (${identityKey}, ${JSON.stringify(heldKeys)}, 0)
      ON CONFLICT(identity_key) DO NOTHING
    `);
  }

  await db.run(sql`DROP TABLE IF EXISTS active_identity_for_key`);
}
