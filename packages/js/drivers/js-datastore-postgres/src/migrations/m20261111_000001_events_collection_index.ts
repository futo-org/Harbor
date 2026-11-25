import { sql } from 'drizzle-orm';
import type { PgExecutor } from '../database.js';

export const name = 'm20261111_000001_events_collection_index';

/**
 * Indexes events by collection for use in `getProfiles()`.
 */
export async function up(db: PgExecutor): Promise<void> {
  await db.execute(
    sql.raw(
      `CREATE INDEX idx_events_collection ON events (event_key_collection)`,
    ),
  );
}
