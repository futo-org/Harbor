import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import {
  DrizzleStorageDriver,
  migrate as migrateSqlite,
  type SqliteDb,
} from '@polycentric/js-storage-sqlite';

/** A storage driver together with the Drizzle database it wraps. */
export interface NodeStorage {
  /** The `IStorageDriver` to hand to `PolycentricClient`. */
  driver: DrizzleStorageDriver;
  /** The underlying Drizzle database, for direct queries. */
  db: SqliteDb;
}

/**
 * Open (creating if missing) the better-sqlite3 database at `databasePath`,
 * run pending migrations, and return a SQLite storage driver for it.
 */
export async function createNodeStorageDriver(
  databasePath: string,
): Promise<NodeStorage> {
  const raw = new Database(databasePath);
  const db = drizzle(raw) as unknown as SqliteDb;
  await migrateSqlite(db);
  const driver = new DrizzleStorageDriver(db);
  return { driver, db };
}
