import type { SqliteDb } from '../database';
import * as m20260506_000001_initial from './m20260506_000001_initial';

export interface Migration {
  name: string;
  up: (db: SqliteDb) => Promise<void>;
}

export const migrations: Migration[] = [m20260506_000001_initial];
