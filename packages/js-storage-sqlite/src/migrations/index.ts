import type { SqliteDb } from '../database.js';
import * as m20260506_000001_initial from './m20260506_000001_initial.js';
import * as m20260617_000001_secure_keys from './m20260617_000001_secure_keys.js';

export interface Migration {
  name: string;
  up: (db: SqliteDb) => Promise<void>;
}

export const migrations: Migration[] = [
  m20260506_000001_initial,
  m20260617_000001_secure_keys,
];
