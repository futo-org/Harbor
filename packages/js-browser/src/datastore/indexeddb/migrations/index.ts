import { DatabaseError } from '@polycentric/js-core';
import { m000003_20261020_initial } from './m000003_20261020_initial';
import { m000004_20261021_drop_event_acks } from './m000004_20261021_drop_event_acks';

/**
 * A single schema migration for the indexedDB database
 *
 * All un-applied migrations are intended to run in one `versionchange`
 * transaction.
 * To facilitate this, implementions of `apply()` must be synchronous and only
 * queue database operations using the transaction provided.
 * The transaction may auto-commit if `await` is used on anything else.
 */
export interface IndexedDBMigration {
  readonly version: number;
  apply(transaction: IDBTransaction): void;
}

/**
 * The list of migrations to apply.
 * Must be ordered by strictly increasing version.
 */
const MIGRATIONS: readonly IndexedDBMigration[] = [
  m000003_20261020_initial,
  m000004_20261021_drop_event_acks,
];

// Sanity check the migration versions
for (let i = 0; i < MIGRATIONS.length; i++) {
  const version = MIGRATIONS[i].version;

  // Must be positive integer
  if (!Number.isInteger(version) || version < 1) {
    throw new DatabaseError(`Invalid IndexedDB version: ${version}`);
  }

  // Must increase version number
  if (i > 0) {
    const prevVersion = MIGRATIONS[i - 1].version;
    if (version <= prevVersion) {
      throw new DatabaseError(
        `IndexedDB migration fails to increase version: ${prevVersion} -> ${version}`,
      );
    }
  }
}

/**
 * The current version of the database schema
 */
export const DATABASE_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * Applies all pending migrations within the upgrade transaction.
 *
 * Should be called from the `onupgradeneeded` handler of an `IDBOpenDBRequest`.
 * On any error, the transaction is aborted and the error is rethrown.
 */
export function onUpgradeNeeded(event: IDBVersionChangeEvent): void {
  const transaction = (event.target as IDBOpenDBRequest).transaction;
  if (!transaction) {
    throw new DatabaseError('No transaction available for IndexedDB upgrade');
  }

  const oldVersion = event.oldVersion;
  const newVersion = event.newVersion ?? DATABASE_VERSION;

  try {
    for (const migration of MIGRATIONS) {
      if (migration.version > oldVersion && migration.version <= newVersion) {
        migration.apply(transaction);
      }
    }
  } catch (error) {
    transaction.abort();
    throw error;
  }
}
