import type { SqliteDb } from '../database.js';
import * as m20260506_000001_initial from './m20260506_000001_initial.js';
import * as m20260805_000001_add_event_endorsement from './m20260805_000001_add_event_endorsement.js';

export interface Migration {
  name: string;
  up: (db: SqliteDb) => Promise<void>;
}

export const migrations: Migration[] = [
  m20260506_000001_initial,
  m20260805_000001_add_event_endorsement,
];
