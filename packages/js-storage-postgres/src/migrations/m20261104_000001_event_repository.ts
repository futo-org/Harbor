import { sql } from 'drizzle-orm';
import { bytesToHex, v2 as Proto } from '@polycentric/js-core';
import { all, type PgExecutor } from '../database.js';

export const name = 'm20261104_000001_event_repository';

const MAX_SEQUENCE = 2n ** 63n - 1n;

const STATEMENTS = [
  `ALTER TABLE events RENAME TO legacy_events`,
  `ALTER INDEX events_pkey RENAME TO legacy_events_pkey`,
  `ALTER INDEX idx_events_identity RENAME TO idx_legacy_events_identity`,
  `ALTER INDEX idx_events_identity_signer RENAME TO idx_legacy_events_identity_signer`,
  `ALTER INDEX idx_events_identity_signer_collection RENAME TO idx_legacy_events_identity_signer_collection`,
  `ALTER TABLE content RENAME TO legacy_content`,
  `ALTER INDEX content_pkey RENAME TO legacy_content_pkey`,
  `CREATE TABLE events (
    owner TEXT NOT NULL,
    event_key_identity TEXT NOT NULL,
    event_key_public_key_type INTEGER NOT NULL,
    event_key_public_key_bytes BYTEA NOT NULL,
    event_key_collection INTEGER NOT NULL,
    event_key_sequence BIGINT NOT NULL,
    event_bytes BYTEA NOT NULL,
    event_signature BYTEA NOT NULL,
    content_status TEXT NOT NULL,
    content_bytes BYTEA NULL,
    PRIMARY KEY (
      owner, event_key_identity, event_key_public_key_type,
      event_key_public_key_bytes, event_key_collection, event_key_sequence
    )
  )`,
];

interface LegacyEventRow {
  signature: Uint8Array;
  event_bytes: Uint8Array;
}

interface LegacyContentRow {
  digest_bytes: Uint8Array;
  content_bytes: Uint8Array;
}

/**
 * Replaces the `events` and `content` tables with a new `events` table that
 * holds each event alongside its content.
 *
 * The old tables and their indexes are kept with a `legacy_` prefix.
 * Events are copied with the identity as the owner, if a matching login exists.
 * Events that can't be migrated are skipped.
 */
export async function up(db: PgExecutor): Promise<void> {
  // Update schema
  for (const stmt of STATEMENTS) {
    await db.execute(sql.raw(stmt));
  }

  // Migrate legacy events/content
  await copyLegacyData(db);
}

async function copyLegacyData(db: PgExecutor): Promise<void> {
  // Derive the set of valid owners
  const logins = await all<{ identity: string }>(
    db,
    sql`SELECT identity FROM logins`,
  );

  const owners = new Set(logins.map((login) => login.identity));

  // Read all legacy content for lookups
  const contentRows = await all<LegacyContentRow>(
    db,
    sql`SELECT digest_bytes, content_bytes FROM legacy_content`,
  );

  const contentByDigest = new Map(
    contentRows.map((row) => [bytesToHex(row.digest_bytes), row.content_bytes]),
  );

  // Copy events
  const eventRows = await all<LegacyEventRow>(
    db,
    sql`SELECT signature, event_bytes FROM legacy_events`,
  );

  for (const row of eventRows) {
    let event: Proto.Event;

    // Skip events that don't decode
    try {
      event = Proto.Event.fromBinary(row.event_bytes);
    } catch {
      continue;
    }

    // Skip events without a valid event key
    const key = event.key;
    const signedBy = key?.signedBy;
    if (
      !key ||
      !signedBy ||
      !event.contentDigest ||
      !owners.has(key.identity) ||
      key.sequence > MAX_SEQUENCE
    ) {
      continue;
    }

    // Try to find the event's content
    const contentBytes = contentByDigest.get(
      bytesToHex(Proto.ContentDigest.toBinary(event.contentDigest)),
    );

    await db.execute(sql`
      INSERT INTO events (
        owner, event_key_identity, event_key_public_key_type,
        event_key_public_key_bytes, event_key_collection, event_key_sequence,
        event_bytes, event_signature, content_status, content_bytes
      )
      VALUES (
        ${key.identity}, ${key.identity}, ${signedBy.keyType},
        ${Buffer.from(signedBy.key)}, ${key.collection}, ${key.sequence},
        ${Buffer.from(row.event_bytes)}, ${Buffer.from(row.signature)},
        ${contentBytes ? 'present' : 'absent'},
        ${contentBytes ? Buffer.from(contentBytes) : null}
      )
    `);
  }
}
