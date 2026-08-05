import { sql } from 'drizzle-orm';
import type { SqliteDb } from '../database.js';

export const name = 'm20260805_000001_add_event_endorsement';

export async function up(db: SqliteDb): Promise<void> {
  await db.run(sql`ALTER TABLE events ADD COLUMN endorsement BLOB NULL`);
}
