declare module '@op-engineering/op-sqlite' {
  export type Scalar =
    | string
    | number
    | boolean
    | null
    | ArrayBuffer
    | ArrayBufferView;

  export interface QueryResult {
    rows?: Record<string, unknown>[];
    rowsAffected: number;
    insertId?: number;
  }

  export interface DB {
    execute(sql: string, params?: Scalar[]): Promise<QueryResult>;
    executeSync(sql: string, params?: unknown[]): QueryResult;
    close(): void;
  }

  export function open(options: { name: string; location?: string }): DB;
}
