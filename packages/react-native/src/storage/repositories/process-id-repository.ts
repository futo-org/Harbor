import type { Database } from '../database';

export class ProcessIdRepository {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  getProcessId(): Uint8Array | null {
    const results = this.database.execute<{
      process_id: ArrayBuffer;
    }>('SELECT process_id FROM process_id WHERE id = 1');

    if (results.length === 0) {
      return null;
    }

    return new Uint8Array(results[0]!.process_id);
  }

  setProcessId(processId: Uint8Array): void {
    this.database.run(
      `INSERT OR REPLACE INTO process_id (id, process_id, updated_at)
       VALUES (1, ?, strftime('%s', 'now') * 1000)`,
      [processId]
    );
  }

  clearProcessId(): void {
    this.database.run('DELETE FROM process_id WHERE id = 1');
  }
}
