import type { IStorageDriver } from '@polycentric/js-core';
import { Database } from './database';
import { EventRepository } from './event.repository';
import { ContentRepository } from './content.repository';
import { KeysRepository } from './keys.repository';
import { EventAckRepository } from './event-ack.repository';

export class ReactNativeStorageDriver implements IStorageDriver {
  private constructor(private readonly database: Database) {}

  static async create(databaseName: string): Promise<ReactNativeStorageDriver> {
    const database = new Database(databaseName);
    await database.open();
    return new ReactNativeStorageDriver(database);
  }

  createEventRepository() {
    return new EventRepository(this.database);
  }

  createContentRepository() {
    return new ContentRepository(this.database);
  }

  createKeysRepository() {
    return new KeysRepository(this.database);
  }

  createEventAckRepository() {
    return new EventAckRepository(this.database);
  }

  saveActiveIdentityKey(
    publicKey: Uint8Array,
    identityKey: string | null
  ): void {
    if (identityKey) {
      this.database.run(
        `INSERT OR REPLACE INTO active_identity_for_key (public_key, identity_key) VALUES (?, ?)`,
        [publicKey, identityKey]
      );
    } else {
      this.database.run(
        `DELETE FROM active_identity_for_key WHERE public_key = ?`,
        [publicKey]
      );
    }
  }

  loadActiveIdentityKey(publicKey: Uint8Array): string | null {
    const rows = this.database.execute<{ identity_key: string }>(
      `SELECT identity_key FROM active_identity_for_key WHERE public_key = ?`,
      [publicKey]
    );
    return rows[0]?.identity_key ?? null;
  }
}
