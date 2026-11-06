import { sql } from 'drizzle-orm';
import { bytesToHex, v2 as Proto } from '@polycentric/js-core';
import type { SqliteDb } from '../database.js';

export const name = 'm20261104_000001_event_repository';

const STATEMENTS = [
  `ALTER TABLE events RENAME TO legacy_events`,
  `ALTER TABLE content RENAME TO legacy_content`,
  `CREATE TABLE events (
    owner TEXT NOT NULL,
    event_key_identity TEXT NOT NULL,
    event_key_public_key_type INTEGER NOT NULL,
    event_key_public_key_bytes BLOB NOT NULL,
    event_key_collection INTEGER NOT NULL,
    event_key_sequence INTEGER NOT NULL,
    event_bytes BLOB NOT NULL,
    event_signature BLOB NOT NULL,
    content_status TEXT NOT NULL,
    content_bytes BLOB NULL,
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
 * The old tables are kept with a `legacy_` prefix.
 * Events are copied with the identity as the owner, if a matching login exists.
 * Events that can't be migrated are skipped.
 */
export async function up(db: SqliteDb): Promise<void> {
  // Update schema
  for (const stmt of STATEMENTS) {
    await db.run(sql.raw(stmt));
  }

  // Migrate legacy events/content
  await copyLegacyData(db);
}

async function copyLegacyData(db: SqliteDb): Promise<void> {
  // Derive the set of valid owners
  const logins = await db.all<{ identity: string }>(sql`
    SELECT identity FROM logins
  `);

  const owners = new Set(logins.map((login) => login.identity));

  // Read all legacy content for lookups
  const contentRows = await db.all<LegacyContentRow>(sql`
    SELECT digest_bytes, content_bytes FROM legacy_content
  `);

  const contentByDigest = new Map(
    contentRows.map((row) => [bytesToHex(row.digest_bytes), row.content_bytes]),
  );

  // Copy events
  const eventRows = await db.all<LegacyEventRow>(sql`
    SELECT signature, event_bytes FROM legacy_events
  `);

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
      key.sequence > Number.MAX_SAFE_INTEGER
    ) {
      continue;
    }

    // Try to find the event's content
    const contentBytes = contentByDigest.get(
      bytesToHex(Proto.ContentDigest.toBinary(event.contentDigest)),
    );

    await db.run(sql`
      INSERT INTO events (
        owner, event_key_identity, event_key_public_key_type,
        event_key_public_key_bytes, event_key_collection, event_key_sequence,
        event_bytes, event_signature, content_status, content_bytes
      )
      VALUES (
        ${key.identity}, ${key.identity}, ${signedBy.keyType}, ${signedBy.key},
        ${key.collection}, ${Number(key.sequence)}, ${row.event_bytes},
        ${row.signature}, ${contentBytes ? 'present' : 'absent'},
        ${contentBytes ?? null}
      )
    `);
  }
}
