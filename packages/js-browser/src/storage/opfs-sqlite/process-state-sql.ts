import type { IProcessStateRepository } from '@polycentric/js-core';
import { DatabaseError } from '@polycentric/js-core';
import { OPFSSQLiteDatabase } from './opfs-sqlite-database';

/**
 * ProcessStateRepository provides SQL-based storage for the logical clock
 * of a given process.
 */
export class SQLProcessStateRepository implements IProcessStateRepository {
  private readonly database: OPFSSQLiteDatabase;

  /**
   * Create a new SQLProcessStateRepository instance
   *
   * @param database - Database instance
   */
  constructor(database: OPFSSQLiteDatabase) {
    this.database = database;
  }

  /**
   * Persist the logical clock for a given process.
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @param logicalClock - The logical clock value to persist
   * @throws {DatabaseError} If the operation fails
   */
  async persistCurrentLogicalClock(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    logicalClock: bigint,
  ): Promise<void> {
    try {
      await this.database.executeNonQuery(
        `INSERT OR REPLACE INTO process_state 
         (system_key_type, system_key, process, logical_clock) 
         VALUES (?, ?, ?, ?)`,
        [systemKeyType.toString(), systemKey, process, logicalClock.toString()],
      );
    } catch (error) {
      throw new DatabaseError('Failed to set logical clock: ', error);
    }
  }

  /**
   * Get the current logical clock for a given process.
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @returns Promise that resolves to the current logical clock or 0 if not found
   * @throws {DatabaseError} If the query fails
   */
  async getCurrentLogicalClock(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
  ): Promise<bigint> {
    try {
      const results = await this.database.executeQuery<{
        logical_clock: string;
      }>(
        `SELECT logical_clock FROM process_state 
         WHERE system_key_type = ? AND system_key = ? AND process = ?`,
        [systemKeyType.toString(), systemKey, process],
      );

      if (results.length > 0) {
        return BigInt(results[0].logical_clock);
      }

      return 0n;
    } catch (error) {
      throw new DatabaseError('Failed to get current logical clock: ', error);
    }
  }

  /**
   * Convenience method to determine the next logical clock for a given process.
   *
   * Note: This method does not persist the new logical clock value.
   * Use persistCurrentLogicalClock to persist the new logical clock value.
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @returns Promise that resolves to the next logical clock value
   * @throws {DatabaseError} If the operation fails
   */
  async getNextLogicalClock(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
  ): Promise<bigint> {
    try {
      const currentLogicalClock = await this.getCurrentLogicalClock(
        systemKeyType,
        systemKey,
        process,
      );

      return currentLogicalClock + 1n;
    } catch (error) {
      throw new DatabaseError(
        `Failed to get next logical clock: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }
}

/**
 * Create a new SQLProcessStateRepository with an initialized database.
 *
 * This method creates a standalone process state repository. It allows for
 * simpler isolation for testing purposes.
 *
 * This method should not be used in practice.
 * In practice create a BrowserStorage instance.
 *
 * @param database - Database instance for storing process state
 * @returns Promise that resolves to an initialized SQLProcessStateRepository
 * @throws {Error} If database initialization fails
 */
export async function _createSQLProcessStateRepository(
  database: OPFSSQLiteDatabase,
): Promise<SQLProcessStateRepository> {
  await database.initialize();
  return new SQLProcessStateRepository(database);
}
