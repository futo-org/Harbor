import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import {
  DrizzleStorageDriver,
  migrate as migrateSqlite,
  type SqliteDb,
} from '@polycentric/js-storage-sqlite';

export interface NodeStorage {
  driver: DrizzleStorageDriver;
  db: SqliteDb;
}

export async function createNodeStorageDriver(
  databasePath: string,
): Promise<NodeStorage> {
  const raw = new Database(databasePath);
  const db = drizzle(raw) as unknown as SqliteDb;
  await migrateSqlite(db);
  const driver = new DrizzleStorageDriver(db);
  return { driver, db };
}
