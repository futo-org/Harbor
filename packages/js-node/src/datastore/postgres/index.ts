import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import {
  DrizzlePgStorageDriver,
  migrate as migratePg,
  type PgDb,
} from '@polycentric/js-storage-postgres';

/** A Postgres storage driver together with the Drizzle database it wraps. */
export interface NodePgStorage {
  /** The `IStorageDriver` to hand to `PolycentricClient`. */
  driver: DrizzlePgStorageDriver;
  /** The underlying Drizzle database, for direct queries. */
  db: PgDb;
}

/**
 * Storage driver backed by postgres. The connection string may carry a
 * `?schema=<name>` param (Prisma convention) — tables then live under that
 * schema instead of `public`. The schema is created if missing and pending
 * migrations are run before returning.
 */
export async function createNodePgStorageDriver(
  connectionString: string,
): Promise<NodePgStorage> {
  const url = new URL(connectionString);
  const schema = url.searchParams.get('schema') ?? undefined;
  url.searchParams.delete('schema');

  if (schema && !/^[a-z_][a-z0-9_]*$/i.test(schema)) {
    throw new Error(`Invalid postgres schema name: '${schema}'`);
  }

  const pool = new pg.Pool({
    connectionString: url.toString(),
    // Scope every connection to the schema.
    ...(schema && { options: `-c search_path=${schema}` }),
  });
  const db = drizzle(pool) as PgDb;
  if (schema) {
    await db.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS ${schema}`));
  }
  await migratePg(db);
  const driver = new DrizzlePgStorageDriver(db);
  return { driver, db };
}
