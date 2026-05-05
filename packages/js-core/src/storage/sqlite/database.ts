import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

export type SqliteDb = BaseSQLiteDatabase<
  'sync' | 'async',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;
