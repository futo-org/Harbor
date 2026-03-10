import {
  _createOPFSSQLiteDatabase,
  OPFSSQLiteDatabase,
} from './opfs-sqlite-database';
import { SQLEventRepository } from './event-store-sql';
import { SQLProcessStateRepository } from './process-state-sql';
import { SQLKeysRepository } from './keys-sql';
import { SQLEventAckRepository } from './event-ack-sql';
import { SQLProcessIdRepository } from './process-id-sql';
import type { IStorageDriver } from '@polycentric/js-core';

export class SqlStorageDriver implements IStorageDriver {
  private readonly database: OPFSSQLiteDatabase;

  private constructor(database: OPFSSQLiteDatabase) {
    this.database = database;
  }

  static async create(databaseName: string) {
    return new SqlStorageDriver(await _createOPFSSQLiteDatabase(databaseName));
  }

  createEventRepository() {
    return new SQLEventRepository(this.database);
  }
  createProcessStateRepository() {
    return new SQLProcessStateRepository(this.database);
  }
  createKeysRepository() {
    return new SQLKeysRepository(this.database);
  }
  createEventAckRepository() {
    return new SQLEventAckRepository(this.database);
  }
  createProcessIdRepository() {
    return new SQLProcessIdRepository(this.database);
  }
}
