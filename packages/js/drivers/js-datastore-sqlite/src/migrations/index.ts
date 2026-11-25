import type { SqliteDb } from '../database.js';
import * as m20260506_000001_initial from './m20260506_000001_initial.js';
import * as m20261029_000001_login_repository from './m20261029_000001_login_repository.js';
import * as m20261104_000001_event_repository from './m20261104_000001_event_repository.js';
import * as m20261111_000001_events_collection_index from './m20261111_000001_events_collection_index.js';

export interface Migration {
  name: string;
  up: (db: SqliteDb) => Promise<void>;
}

export const migrations: Migration[] = [
  m20260506_000001_initial,
  m20261029_000001_login_repository,
  m20261104_000001_event_repository,
  m20261111_000001_events_collection_index,
];
