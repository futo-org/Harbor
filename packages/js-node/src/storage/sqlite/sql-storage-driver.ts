import {
  _createNodeSQLiteDatabase,
  NodeSQLiteDatabase,
} from './sqlite-database';
import { SQLEventRepository } from './event-store-sql';
import { SQLProcessStateRepository } from './process-state-sql';
import { SQLKeysRepository } from './keys-sql';
import { SQLEventAckRepository } from './event-ack-sql';
import { SQLProcessIdRepository } from './process-id-sql';
export class SqlStorageDriver {
  private readonly database: NodeSQLiteDatabase;

  //Private constructor, use the create method instead so that we can create the database asynchronously
  private constructor(database: NodeSQLiteDatabase) {
    this.database = database;
  }

  static async create(databaseName: string, databaseDir?: string) {
    return new SqlStorageDriver(
      await _createNodeSQLiteDatabase(databaseName, databaseDir),
    );
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
