import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

export type SqliteDb = BaseSQLiteDatabase<
  'sync' | 'async',
  // biome-ignore lint/suspicious/noExplicitAny: matches the untyped sqlite driver interface
  any,
  // biome-ignore lint/suspicious/noExplicitAny: matches the untyped sqlite driver interface
  any
>;
