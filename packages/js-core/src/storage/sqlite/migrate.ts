import { sql } from 'drizzle-orm';
import type { SqliteDb } from './database';
import { migrations } from './migrations';

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
      await db.run(
        sql`INSERT INTO __migrations (name, applied_at) VALUES (${m.name}, ${Date.now()})`,
      );
      await db.run(sql`COMMIT`);
    } catch (err) {
      await db.run(sql`ROLLBACK`);
      throw err;
    }
  }
}
