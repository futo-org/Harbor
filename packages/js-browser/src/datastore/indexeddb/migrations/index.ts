import type { IStorageDriver } from '@polycentric/js-core';
import { IndexedDBDatabase, IndexedDBDatabaseLayout } from '../database';
import * as m20260626_000001_identity_records from './m20260626_000001_identity_records';

const MIGRATIONS_STORE = 'migrations';

type MigrationRecord = {
  name: string;
  completedAt: number;
};

export interface IndexedDBMigration {
  name: string;
  up: (driver: IStorageDriver) => Promise<void>;
}

export const migrations: IndexedDBMigration[] = [
  m20260626_000001_identity_records,
];

export function createNeededStores(layout: IndexedDBDatabaseLayout) {
  layout.stores.push({
    name: MIGRATIONS_STORE,
    options: { keyPath: 'name' },
    indexes: [],
  });
}

export async function runMigrations(
  database: IndexedDBDatabase,
  driver: IStorageDriver,
): Promise<void> {
  const completed = await getCompletedMigrations(database);

  for (const migration of migrations) {
    if (completed.has(migration.name)) continue;

    await migration.up(driver);
    await markMigrationComplete(database, migration.name);
  }
}

async function getCompletedMigrations(
  database: IndexedDBDatabase,
): Promise<Set<string>> {
  const transaction = database.createTransaction(MIGRATIONS_STORE, 'readonly');
  const store = transaction.objectStore(MIGRATIONS_STORE);
  const rows = await IndexedDBDatabase.requestAsPromise<MigrationRecord[]>(
    store.getAll(),
  );
  return new Set(rows.map((row) => row.name));
}

async function markMigrationComplete(
  database: IndexedDBDatabase,
  name: string,
): Promise<void> {
  const transaction = database.createTransaction(MIGRATIONS_STORE, 'readwrite');
  const store = transaction.objectStore(MIGRATIONS_STORE);
  await IndexedDBDatabase.requestAsPromise(
    store.put({ name, completedAt: Date.now() }),
  );
  transaction.commit();
}
