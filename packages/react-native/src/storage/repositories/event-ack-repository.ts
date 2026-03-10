import type { Database } from '../database';

export class EventAckRepository {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  storeEventAck(
    systemKeyType: number,
    systemKey: Uint8Array,
    process: Uint8Array,
    logicalClock: number,
    serverUrl: string
  ): void {
    this.database.run(
      `INSERT OR REPLACE INTO event_acks (
        system_key_type, system_key, process, logical_clock, server_url
      ) VALUES (?, ?, ?, ?, ?)`,
      [systemKeyType, systemKey, process, logicalClock, serverUrl]
    );
  }

  getEventAcks(
    systemKeyType: number,
    systemKey: Uint8Array,
    process: Uint8Array,
    logicalClock: number
  ): string[] {
    const results = this.database.execute<{
      server_url: string;
    }>(
      'SELECT server_url FROM event_acks WHERE system_key_type = ? AND system_key = ? AND process = ? AND logical_clock = ?',
      [systemKeyType, systemKey, process, logicalClock]
    );

    return results.map((row) => row.server_url);
  }

  hasEventAck(
    systemKeyType: number,
    systemKey: Uint8Array,
    process: Uint8Array,
    logicalClock: number,
    serverUrl: string
  ): boolean {
    const results = this.database.execute<{
      count: number;
    }>(
      'SELECT COUNT(*) as count FROM event_acks WHERE system_key_type = ? AND system_key = ? AND process = ? AND logical_clock = ? AND server_url = ?',
      [systemKeyType, systemKey, process, logicalClock, serverUrl]
    );

    return results.length > 0 && results[0]!.count > 0;
  }

  removeEventAcks(
    systemKeyType: number,
    systemKey: Uint8Array,
    process: Uint8Array,
    logicalClock: number
  ): void {
    this.database.run(
      'DELETE FROM event_acks WHERE system_key_type = ? AND system_key = ? AND process = ? AND logical_clock = ?',
      [systemKeyType, systemKey, process, logicalClock]
    );
  }
}
