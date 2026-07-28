import { sql } from 'drizzle-orm';
import { all, type PgDb } from './database.js';
import { migrations } from './migrations/index.js';

/**
 * Custom migrations, mirroring js-storage-sqlite. Each unapplied migration
 * runs in its own transaction.
 */
export async function migrate(db: PgDb): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS __migrations (
      name TEXT PRIMARY KEY,
      applied_at BIGINT NOT NULL
    )
  `);
  const rows = await all<{ name: string }>(
    db,
    sql`SELECT name FROM __migrations`,
  );
  const applied = new Set(rows.map((r) => r.name));
  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    await db.transaction(async (tx) => {
      await m.up(tx);
      await tx.execute(
        sql`INSERT INTO __migrations (name, applied_at) VALUES (${m.name}, ${Date.now()})`,
      );
    });
  }
}
