import type { IProcessIdRepository } from '@polycentric/js-core';
import { DatabaseError } from '@polycentric/js-core';
import { Process } from '@polycentric/js-core';
import { NodeSQLiteDatabase } from './sqlite-database';

/**
 * SQLProcessIdentifierRepository provides SQL-based storage for the device's process ID
 */
export class SQLProcessIdRepository implements IProcessIdRepository {
  private readonly database: NodeSQLiteDatabase;

  constructor(database: NodeSQLiteDatabase) {
    this.database = database;
  }

  async getProcessId(): Promise<Process | null> {
    try {
      const results = await this.database.executeQuery<{
        process_id: Buffer;
      }>('SELECT process_id FROM process_id WHERE id = 1');

      if (results.length === 0) {
        return null;
      }

      return Process.create({
        process: Uint8Array.from(results[0].process_id),
      });
    } catch (error) {
      throw new DatabaseError('Failed to get process identifier: ', error);
    }
  }

  async setProcessId(processId: Process): Promise<void> {
    try {
      await this.database.executeNonQuery(
        `INSERT OR REPLACE INTO process_id (id, process_id, updated_at)
         VALUES (1, ?, strftime('%s', 'now') * 1000)`,
        [processId.process],
      );
    } catch (error) {
      throw new DatabaseError('Failed to set process id: ', error);
    }
  }
}

export async function _createSQLProcessIdRepository(
  database: NodeSQLiteDatabase,
): Promise<SQLProcessIdRepository> {
  await database.initialize();
  return new SQLProcessIdRepository(database);
}
