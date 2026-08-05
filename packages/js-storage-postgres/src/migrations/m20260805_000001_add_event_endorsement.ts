import { sql } from 'drizzle-orm';
import type { PgExecutor } from '../database.js';

export const name = 'm20260805_000001_add_event_endorsement';

export async function up(db: PgExecutor): Promise<void> {
  await db.execute(sql`ALTER TABLE events ADD COLUMN endorsement BYTEA NULL`);
}
