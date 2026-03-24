import { open, type DB, type Scalar } from '@op-engineering/op-sqlite';
import { type DatabaseSchema, schemaV1 } from './schema';

export class Database {
  private db: DB | null = null;
  private readonly databaseName: string;
  private readonly schema: DatabaseSchema;

  constructor(databaseName: string, customSchema?: DatabaseSchema) {
    this.databaseName = databaseName;
    this.schema = customSchema ?? schemaV1;
  }

  async open(): Promise<void> {
    if (this.db) {
      return;
    }

    this.db = open({ name: this.databaseName });
    this.initializeSchema();
  }

  private initializeSchema(): void {
    for (const table of this.schema.tables) {
      this.run(table);
    }

    for (const index of this.schema.indexes) {
      this.run(index);
    }

    if (this.schema.views) {
      for (const view of this.schema.views) {
        this.run(view);
      }
    }
  }

  execute<T>(sql: string, params?: Scalar[]): T[] {
    if (!this.db) {
      throw new Error('Database not opened');
    }

    const result = this.db.executeSync(
      sql,
      params ? Database.sanitizeParams(params) : params
    );
    return (result.rows ?? []) as T[];
  }

  run(sql: string, params?: Scalar[]): void {
    if (!this.db) {
      throw new Error('Database not opened');
    }

    this.db.executeSync(sql, params ? Database.sanitizeParams(params) : params);
  }

  /**
   * Copy any Uint8Array that is a subarray view of a larger ArrayBuffer.
   * protobuf.js reader.bytes() returns subarrays (non-zero byteOffset),
   * and op-sqlite binds the entire backing ArrayBuffer, ignoring the view.
   */
  private static sanitizeParams(params: Scalar[]): Scalar[] {
    return params.map((p) => {
      if (
        p instanceof Uint8Array &&
        (p.byteOffset !== 0 || p.buffer.byteLength !== p.byteLength)
      ) {
        return p.slice();
      }
      return p;
    });
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
