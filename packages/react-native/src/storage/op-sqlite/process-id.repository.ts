import type { Database } from './database';
import { Process, type IProcessIdRepository } from '@polycentric/js-core';

export class ProcessIdRepository implements IProcessIdRepository {
  constructor(private readonly database: Database) {}

  async getProcessId(): Promise<Process | null> {
    const results = this.database.execute<{
      process_id: ArrayBuffer;
    }>('SELECT process_id FROM process_id WHERE id = 1');

    if (results.length === 0) {
      return null;
    }

    return Process.create({
      process: new Uint8Array(results[0]!.process_id),
    });
  }

  async setProcessId(processId: Process): Promise<void> {
    this.database.run(
      `INSERT OR REPLACE INTO process_id (id, process_id, updated_at)
       VALUES (1, ?, strftime('%s', 'now') * 1000)`,
      [processId.process]
    );
  }
}
