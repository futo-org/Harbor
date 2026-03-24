import type { Database } from './database';
import type { IEventAckRepository } from '@polycentric/js-core';

export class EventAckRepository implements IEventAckRepository {
  constructor(private readonly database: Database) {}

  async storeEventAck(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    logicalClock: bigint,
    serverUrl: string
  ): Promise<void> {
    this.database.run(
      `INSERT OR REPLACE INTO event_acks (
        system_key_type, system_key, process, logical_clock, server_url
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        Number(systemKeyType),
        systemKey,
        process,
        Number(logicalClock),
        serverUrl,
      ]
    );
  }

  async getEventAcks(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    logicalClock: bigint
  ): Promise<string[]> {
    const results = this.database.execute<{
      server_url: string;
    }>(
      'SELECT server_url FROM event_acks WHERE system_key_type = ? AND system_key = ? AND process = ? AND logical_clock = ?',
      [Number(systemKeyType), systemKey, process, Number(logicalClock)]
    );

    return results.map((row) => row.server_url);
  }

  async hasEventAck(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    logicalClock: bigint,
    serverUrl: string
  ): Promise<boolean> {
    const results = this.database.execute<{
      count: number;
    }>(
      'SELECT COUNT(*) as count FROM event_acks WHERE system_key_type = ? AND system_key = ? AND process = ? AND logical_clock = ? AND server_url = ?',
      [
        Number(systemKeyType),
        systemKey,
        process,
        Number(logicalClock),
        serverUrl,
      ]
    );

    return results.length > 0 && results[0]!.count > 0;
  }

  async removeEventAcks(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    logicalClock: bigint
  ): Promise<void> {
    this.database.run(
      'DELETE FROM event_acks WHERE system_key_type = ? AND system_key = ? AND process = ? AND logical_clock = ?',
      [Number(systemKeyType), systemKey, process, Number(logicalClock)]
    );
  }
}
