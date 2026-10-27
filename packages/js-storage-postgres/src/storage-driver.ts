import { sql } from 'drizzle-orm';
import type { IStorageDriver } from '@polycentric/js-core';
import { all, type PgDb } from './database.js';
import { ContentRepository } from './repositories/content.repository.js';
import { EventRepository } from './repositories/event.repository.js';
import { KeysRepository } from './repositories/keys.repository.js';

export class DrizzlePgStorageDriver implements IStorageDriver {
  constructor(private readonly db: PgDb) {}

  createEventRepository() {
    return new EventRepository(this.db);
  }

  createContentRepository() {
    return new ContentRepository(this.db);
  }

  createKeysRepository() {
    return new KeysRepository(this.db);
  }

  async saveActiveIdentityKey(
    publicKey: Uint8Array,
    identityKey: string | null,
  ): Promise<void> {
    const key = Buffer.from(publicKey);
    if (identityKey === null) {
      await this.db.execute(sql`
        DELETE FROM active_identity_for_key WHERE public_key = ${key}
      `);
      return;
    }
    await this.db.execute(sql`
      INSERT INTO active_identity_for_key (public_key, identity_key)
      VALUES (${key}, ${identityKey})
      ON CONFLICT (public_key) DO UPDATE SET
        identity_key = EXCLUDED.identity_key
    `);
  }

  async loadActiveIdentityKey(publicKey: Uint8Array): Promise<string | null> {
    const rows = await all<{ identity_key: string | null }>(
      this.db,
      sql`
        SELECT identity_key FROM active_identity_for_key
        WHERE public_key = ${Buffer.from(publicKey)}
        LIMIT 1
      `,
    );
    return rows[0]?.identity_key ?? null;
  }
}
