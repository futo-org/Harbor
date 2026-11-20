import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import {
  DrizzleStorageDriver,
  migrate as migrateSqlite,
  type SqliteDb,
} from '@polycentric/js-storage-sqlite';

/** The open, or opening, driver per database name. `openDatabaseSync` hands
 *  every caller one cached connection, so overlapping opens would migrate
 *  inside each other's transaction. */
const drivers = new Map<string, Promise<DrizzleStorageDriver>>();

export function createReactNativeStorageDriver(
  databaseName: string,
): Promise<DrizzleStorageDriver> {
  const opening = drivers.get(databaseName);
  if (opening) return opening;

  const pending = (async () => {
    const raw = openDatabaseSync(databaseName);
    const db = drizzle(raw) as unknown as SqliteDb;
    await migrateSqlite(db);
    return new DrizzleStorageDriver(db);
  })().catch((err) => {
    // Leave a failure uncached so a later attempt can recover.
    drivers.delete(databaseName);
    throw err;
  });

  drivers.set(databaseName, pending);
  return pending;
}
