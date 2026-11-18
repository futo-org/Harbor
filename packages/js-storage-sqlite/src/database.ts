import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

/**
 * Any Drizzle SQLite database, sync or async. Callers cast their concrete
 * Drizzle instance to this type.
 */
export type SqliteDb = BaseSQLiteDatabase<
  'sync' | 'async',
  // biome-ignore lint/suspicious/noExplicitAny: matches the untyped sqlite driver interface
  any,
  // biome-ignore lint/suspicious/noExplicitAny: matches the untyped sqlite driver interface
  any
>;
