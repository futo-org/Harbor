import { sql } from 'drizzle-orm';
import type { IEventAckRepository, IStorageDriver } from '@polycentric/js-core';
import type { SqliteDb } from './database.js';
import { ContentRepository } from './repositories/content.repository.js';
import { EventRepository } from './repositories/event.repository.js';
import { KeysRepository } from './repositories/keys.repository.js';

// TODO EventAcks aren't currently used
class EventAckRepository implements IEventAckRepository {
  async storeEventAck(): Promise<void> {}
  async getEventAcks(): Promise<string[]> {
    return [];
  }
  async hasEventAck(): Promise<boolean> {
    return false;
  }
  async removeEventAcks(): Promise<void> {}
}

export class DrizzleStorageDriver implements IStorageDriver {
  constructor(private readonly db: SqliteDb) {}

  createEventRepository() {
    return new EventRepository(this.db);
  }

  createContentRepository() {
    return new ContentRepository(this.db);
  }

  createKeysRepository() {
    return new KeysRepository(this.db);
  }

  createEventAckRepository() {
    return new EventAckRepository();
  }

  async saveActiveIdentityKey(
    publicKey: Uint8Array,
    identityKey: string | null,
  ): Promise<void> {
    if (identityKey === null) {
      await this.db.run(sql`
        DELETE FROM active_identity_for_key WHERE public_key = ${publicKey}
      `);
      return;
    }
    await this.db.run(sql`
      INSERT INTO active_identity_for_key (public_key, identity_key)
      VALUES (${publicKey}, ${identityKey})
      ON CONFLICT(public_key) DO UPDATE SET
        identity_key = excluded.identity_key
    `);
  }

  async loadActiveIdentityKey(publicKey: Uint8Array): Promise<string | null> {
    const rows = await this.db.all<{ identity_key: string | null }>(sql`
      SELECT identity_key FROM active_identity_for_key
      WHERE public_key = ${publicKey}
      LIMIT 1
    `);
    return rows[0]?.identity_key ?? null;
  }
}
