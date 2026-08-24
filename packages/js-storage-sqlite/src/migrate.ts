import { sql } from 'drizzle-orm';
import type { SqliteDb } from './database.js';
import { migrations } from './migrations/index.js';

/**
 * Custom migrations.
 * `drizzle kit` migrations aren't a great fit
 * due to awkward compatibility between
 * Node.js and React Native environments.
 */
export async function migrate(db: SqliteDb): Promise<void> {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS __migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);
  const rows = await db.all<{ name: string }>(
    sql`SELECT name FROM __migrations`,
  );
  const applied = new Set(rows.map((r) => r.name));
  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    await db.run(sql`BEGIN`);
    try {
      await m.up(db);
      // Statements are idempotent; an already recorded name is not a conflict.
      await db.run(
        sql`INSERT OR IGNORE INTO __migrations (name, applied_at) VALUES (${m.name}, ${Date.now()})`,
      );
      await db.run(sql`COMMIT`);
    } catch (err) {
      try {
        await db.run(sql`ROLLBACK`);
      } catch {}
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`migration ${m.name} failed: ${reason}`, { cause: err });
    }
  }
}
