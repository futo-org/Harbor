import type { IEventAckRepository, IStorageDriver } from '@polycentric/js-core';
import type { SqliteDb } from './database.js';
import { ContentRepository } from './repositories/content.repository.js';
import { EventRepository } from './repositories/event.repository.js';
import { KeysRepository } from './repositories/keys.repository.js';
import { IdentityRepository } from './repositories/identity.repository.js';

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

  createIdentityRepository() {
    return new IdentityRepository(this.db);
  }
}
