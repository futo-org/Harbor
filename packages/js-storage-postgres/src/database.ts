import type { SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/** A Drizzle `node-postgres` database, as accepted by this package. */
// biome-ignore lint/suspicious/noExplicitAny: matches the untyped pg driver interface
export type PgDb = NodePgDatabase<any>;

/** Anything that can run a statement — the db or a transaction. */
export type PgExecutor = Pick<PgDb, 'execute'>;

/** Run a query and return its rows, typed. */
export async function all<T>(db: PgExecutor, query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return result.rows as T[];
}
