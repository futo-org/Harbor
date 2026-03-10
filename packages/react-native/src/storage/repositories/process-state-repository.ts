import type { Database } from '../database';

export class ProcessStateRepository {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  persistCurrentLogicalClock(
    systemKeyType: number,
    systemKey: Uint8Array,
    process: Uint8Array,
    logicalClock: number
  ): void {
    this.database.run(
      `INSERT OR REPLACE INTO process_state
       (system_key_type, system_key, process, logical_clock)
       VALUES (?, ?, ?, ?)`,
      [systemKeyType, systemKey, process, logicalClock]
    );
  }

  getCurrentLogicalClock(
    systemKeyType: number,
    systemKey: Uint8Array,
    process: Uint8Array
  ): number {
    const results = this.database.execute<{
      logical_clock: number;
    }>(
      `SELECT logical_clock FROM process_state
       WHERE system_key_type = ? AND system_key = ? AND process = ?`,
      [systemKeyType, systemKey, process]
    );

    if (results.length > 0) {
      return results[0]!.logical_clock;
    }

    return 0;
  }

  getNextLogicalClock(
    systemKeyType: number,
    systemKey: Uint8Array,
    process: Uint8Array
  ): number {
    return this.getCurrentLogicalClock(systemKeyType, systemKey, process) + 1;
  }
}
