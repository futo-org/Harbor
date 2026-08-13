import type { SqliteDb } from '../database.js';
import * as m20260506_000001_initial from './m20260506_000001_initial.js';

export interface Migration {
  name: string;
  up: (db: SqliteDb) => Promise<void>;
}

export const migrations: Migration[] = [m20260506_000001_initial];
