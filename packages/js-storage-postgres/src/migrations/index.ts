import type { PgExecutor } from '../database.js';
import * as m20260724_000001_initial from './m20260724_000001_initial.js';
import * as m20261029_000001_login_repository from './m20261029_000001_login_repository.js';

export interface Migration {
  name: string;
  up: (db: PgExecutor) => Promise<void>;
}

export const migrations: Migration[] = [
  m20260724_000001_initial,
  m20261029_000001_login_repository,
];
