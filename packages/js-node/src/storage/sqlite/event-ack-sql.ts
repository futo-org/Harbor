import type { IEventAckRepository } from '@polycentric/js-core';
import { DatabaseError } from '@polycentric/js-core';
import { NodeSQLiteDatabase } from './sqlite-database';

/**
 * EventAckRepository provides SQL-based storage for event acknowledgments.
 */
export class SQLEventAckRepository implements IEventAckRepository {
  private readonly database: NodeSQLiteDatabase;

  /**
   * Create a new SQLEventAckRepository instance
   *
   * @param database - Database instance
   */
  constructor(database: NodeSQLiteDatabase) {
    this.database = database;
  }

  /**
   * Store an event acknowledgment in the database.
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @param logicalClock - The logical clock of the acknowledged event
   * @param serverUrl - The server URL that acknowledged the event
   * @throws {DatabaseError} If storing fails
   */
  async storeEventAck(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    logicalClock: bigint,
    serverUrl: string,
  ): Promise<void> {
    try {
      await this.database.executeNonQuery(
        `INSERT OR REPLACE INTO event_acks (
          system_key_type, system_key, process, logical_clock, server_url
        ) VALUES (?, ?, ?, ?, ?)`,
        [
          systemKeyType.toString(),
          systemKey,
          process,
          logicalClock.toString(),
          serverUrl,
        ],
      );
    } catch (error) {
      throw new DatabaseError('Failed to store event acknowledgment: ', error);
    }
  }

  /**
   * Retrieve event acknowledgments for a specific event.
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @param logicalClock - The logical clock of the event
   * @returns Promise that resolves to an array of server URLs that acknowledged the event
   */
  async getEventAcks(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    logicalClock: bigint,
  ): Promise<string[]> {
    try {
      const results = await this.database.executeQuery<{
        server_url: string;
      }>(
        'SELECT server_url FROM event_acks WHERE system_key_type = ? AND system_key = ? AND process = ? AND logical_clock = ?',
        [systemKeyType.toString(), systemKey, process, logicalClock.toString()],
      );

      return results.map((row) => row.server_url);
    } catch (error) {
      throw new DatabaseError(
        'Failed to retrieve event acknowledgments: ',
        error,
      );
    }
  }

  /**
   * Check if a specific event has been acknowledged by a specific server.
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @param logicalClock - The logical clock of the event
   * @param serverUrl - The server URL to check
   * @returns Promise that resolves to true if acknowledged, false otherwise
   */
  async hasEventAck(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    logicalClock: bigint,
    serverUrl: string,
  ): Promise<boolean> {
    try {
      const results = await this.database.executeQuery<{
        count: number;
      }>(
        'SELECT COUNT(*) as count FROM event_acks WHERE system_key_type = ? AND system_key = ? AND process = ? AND logical_clock = ? AND server_url = ?',
        [
          systemKeyType.toString(),
          systemKey,
          process,
          logicalClock.toString(),
          serverUrl,
        ],
      );

      return results.length > 0 && results[0].count > 0;
    } catch (error) {
      throw new DatabaseError('Failed to check event acknowledgment: ', error);
    }
  }

  /**
   * Remove event acknowledgments for a specific event.
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @param logicalClock - The logical clock of the event
   * @throws {DatabaseError} If removal fails
   */
  async removeEventAcks(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    logicalClock: bigint,
  ): Promise<void> {
    try {
      await this.database.executeNonQuery(
        'DELETE FROM event_acks WHERE system_key_type = ? AND system_key = ? AND process = ? AND logical_clock = ?',
        [systemKeyType.toString(), systemKey, process, logicalClock.toString()],
      );
    } catch (error) {
      throw new DatabaseError(
        'Failed to remove event acknowledgments: ',
        error,
      );
    }
  }
}

/**
 * Create a new SQLEventAckRepository with an initialized database.
 *
 * This method creates a standalone event acknowledgment repository. It allows for
 * simpler isolation for testing purposes.
 *
 * This method should not be used in practice.
 * In practice create a BrowserStorage instance.
 *
 * @param db - Database instance for storing event acknowledgments
 * @returns Promise that resolves to an initialized SQLEventAckRepository
 * @throws {Error} If database initialization fails
 */
export async function _createSQLEventAckRepository(
  db: NodeSQLiteDatabase,
): Promise<SQLEventAckRepository> {
  await db.initialize();
  return new SQLEventAckRepository(db);
}
