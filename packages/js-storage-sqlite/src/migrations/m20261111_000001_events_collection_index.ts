import { sql } from 'drizzle-orm';
import type { SqliteDb } from '../database.js';

export const name = 'm20261111_000001_events_collection_index';

/**
 * Indexes events by collection for use in `getProfiles()`.
 */
export async function up(db: SqliteDb): Promise<void> {
  await db.run(
    sql.raw(
      `CREATE INDEX idx_events_collection ON events (event_key_collection)`,
    ),
  );
}
