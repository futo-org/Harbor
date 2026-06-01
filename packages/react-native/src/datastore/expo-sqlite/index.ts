import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import {
  DrizzleStorageDriver,
  migrate as migrateSqlite,
  type SqliteDb,
} from '@polycentric/js-storage-sqlite';

export async function createReactNativeStorageDriver(
  databaseName: string,
): Promise<DrizzleStorageDriver> {
  const raw = openDatabaseSync(databaseName);
  const db = drizzle(raw) as unknown as SqliteDb;
  await migrateSqlite(db);
  return new DrizzleStorageDriver(db);
}
