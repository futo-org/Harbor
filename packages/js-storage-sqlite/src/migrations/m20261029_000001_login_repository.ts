import { sql } from 'drizzle-orm';
import { v2 as Proto } from '@polycentric/js-core';
import type { SqliteDb } from '../database.js';

export const name = 'm20261029_000001_login_repository';

const IDENTITY_COLLECTION = 1;

const STATEMENTS = [
  `ALTER TABLE keys RENAME TO legacy_keys`,
  `ALTER TABLE active_identity_for_key RENAME TO legacy_active_identity_for_key`,
  `CREATE TABLE logins (
    identity TEXT NOT NULL,
    key_type INTEGER NOT NULL,
    public_key BLOB NOT NULL,
    status TEXT NOT NULL,
    private_key_location TEXT NOT NULL,
    private_key BLOB NULL,
    private_key_token TEXT NULL,
    PRIMARY KEY (identity, key_type, public_key)
  )`,
  `CREATE INDEX idx_logins_status ON logins (status)`,
  `CREATE TABLE active_login (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    identity TEXT NOT NULL,
    key_type INTEGER NOT NULL,
    public_key BLOB NOT NULL
  )`,
];

interface LegacyKeyRow {
  key_type: number;
  public_key: Uint8Array;
  private_key: Uint8Array;
  identity_key: string | null;
}

/**
 * Replaces the `keys` table with the new `logins` table.
 *
 * The old tables are kept with a `legacy_` prefix.
 * We migrate the first keypair as a login if it has an active identity.
 *
 * Also creates the `active_login` table and records the migrated login as
 * the active login.
 */
export async function up(db: SqliteDb): Promise<void> {
  for (const stmt of STATEMENTS) {
    await db.run(sql.raw(stmt));
  }

  // Migrate existing key pair
  const [legacy] = await db.all<LegacyKeyRow>(sql`
    SELECT k.key_type, k.public_key, k.private_key, a.identity_key
    FROM legacy_keys k
    LEFT JOIN legacy_active_identity_for_key a ON a.public_key = k.public_key
    ORDER BY k.rowid
    LIMIT 1
  `);
  if (!legacy?.identity_key) {
    return;
  }

  const identity = legacy.identity_key;
  const status = await lookupStatus(db, identity, legacy);

  await db.run(sql`
    INSERT INTO logins (
      identity, key_type, public_key, status, private_key_location, private_key
    )
    VALUES (
      ${identity}, ${legacy.key_type}, ${legacy.public_key}, ${status},
      'inline', ${legacy.private_key}
    )
  `);

  // Mark the migrated login as active
  await db.run(sql`
    INSERT INTO active_login (id, identity, key_type, public_key)
    VALUES (1, ${identity}, ${legacy.key_type}, ${legacy.public_key})
  `);
}

/**
 * Derive the status of the legacy key pair from the latest identity event.
 * Falls back to `liveRotationKey` on failure.
 */
async function lookupStatus(
  db: SqliteDb,
  identity: string,
  legacy: LegacyKeyRow,
): Promise<string> {
  try {
    // Find latest identity event
    const [latest] = await db.all<{ event_bytes: Uint8Array }>(sql`
      SELECT event_bytes FROM events
      WHERE identity = ${identity} AND collection = ${IDENTITY_COLLECTION}
      ORDER BY sequence DESC
      LIMIT 1
    `);

    if (!latest) {
      return 'liveRotationKey';
    }

    // Get matching identity content
    const event = Proto.Event.fromBinary(latest.event_bytes);
    if (!event.contentDigest) {
      return 'liveRotationKey';
    }

    const digestBytes = Proto.ContentDigest.toBinary(event.contentDigest);

    const [row] = await db.all<{ content_bytes: Uint8Array }>(sql`
      SELECT content_bytes FROM content
      WHERE digest_bytes = ${digestBytes}
      LIMIT 1
    `);

    if (!row) {
      return 'liveRotationKey';
    }

    const content = Proto.Content.fromBinary(row.content_bytes);
    if (content.contentBody.oneofKind !== 'identity') {
      return 'liveRotationKey';
    }

    // Derive key pair status
    const doc = content.contentBody.identity;
    const matches = (key: Proto.PublicKey) => {
      if (key.keyType !== legacy.key_type) return false;
      return bytesEqual(key.key, legacy.public_key);
    };

    if (doc.rotationKeys.some(matches)) {
      return 'liveRotationKey';
    }

    if (doc.signingKeys.some(matches)) {
      return 'liveSigningKey';
    }

    return 'revoked';
  } catch {
    return 'liveRotationKey';
  }
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}
