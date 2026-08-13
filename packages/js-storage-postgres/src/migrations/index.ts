import type { PgExecutor } from '../database.js';
import * as m20260724_000001_initial from './m20260724_000001_initial.js';

export interface Migration {
  name: string;
  up: (db: PgExecutor) => Promise<void>;
}

export const migrations: Migration[] = [m20260724_000001_initial];
