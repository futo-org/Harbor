import { DatabaseError } from '@polycentric/js-core';
import { m000003_20261020_initial } from './m000003_20261020_initial';
import { m000004_20261021_drop_event_acks } from './m000004_20261021_drop_event_acks';
import { m000005_20261021_key_repository } from './m000005_20261021_key_repository';

/**
 * A single schema migration for the indexedDB database
 *
 * All un-applied migrations run sequentially in one `versionchange`
 * transaction.
 * Implementations of `apply()` may only `await` requests made on the
 * transaction provided.
 * The transaction may auto-commit if `await` is used on anything else.
 */
export interface IndexedDBMigration {
  readonly version: number;
  apply(transaction: IDBTransaction): Promise<void>;
}

/**
 * The list of migrations to apply.
 * Must be ordered by strictly increasing version.
 */
const MIGRATIONS: readonly IndexedDBMigration[] = [
  m000003_20261020_initial,
  m000004_20261021_drop_event_acks,
  m000005_20261021_key_repository,
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
export function onUpgradeNeeded(event: IDBVersionChangeEvent): Promise<void> {
  const transaction = (event.target as IDBOpenDBRequest).transaction;
  if (!transaction) {
    throw new DatabaseError('No transaction available for IndexedDB upgrade');
  }

  const oldVersion = event.oldVersion;
  const newVersion = event.newVersion ?? DATABASE_VERSION;

  return applyMigrations(transaction, oldVersion, newVersion);
}

async function applyMigrations(
  transaction: IDBTransaction,
  oldVersion: number,
  newVersion: number,
): Promise<void> {
  try {
    for (const migration of MIGRATIONS) {
      if (migration.version > oldVersion && migration.version <= newVersion) {
        await migration.apply(transaction);
      }
    }
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // Already aborted by a failed request
    }
    throw error;
  }
}
