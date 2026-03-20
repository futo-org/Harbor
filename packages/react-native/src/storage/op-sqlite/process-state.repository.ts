import type { Database } from './database';
import type { IProcessStateRepository } from '@polycentric/js-core';

export class ProcessStateRepository implements IProcessStateRepository {
  constructor(private readonly database: Database) {}

  async persistCurrentLogicalClock(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    logicalClock: bigint
  ): Promise<void> {
    this.database.run(
      `INSERT OR REPLACE INTO process_state
       (system_key_type, system_key, process, logical_clock)
       VALUES (?, ?, ?, ?)`,
      [Number(systemKeyType), systemKey, process, Number(logicalClock)]
    );
  }

  async getCurrentLogicalClock(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array
  ): Promise<bigint> {
    const results = this.database.execute<{
      logical_clock: number;
    }>(
      `SELECT logical_clock FROM process_state
       WHERE system_key_type = ? AND system_key = ? AND process = ?`,
      [Number(systemKeyType), systemKey, process]
    );

    if (results.length === 0) {
      return 0n;
    }

    return BigInt(results[0]!.logical_clock);
  }

  async getNextLogicalClock(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array
  ): Promise<bigint> {
    return (
      (await this.getCurrentLogicalClock(systemKeyType, systemKey, process)) +
      1n
    );
  }
}
