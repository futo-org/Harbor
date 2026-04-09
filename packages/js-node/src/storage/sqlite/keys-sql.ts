import type { IKeysRepository, PrivateKey } from '@polycentric/js-core';
import { v2, DatabaseError } from '@polycentric/js-core';
import { NodeSQLiteDatabase } from './sqlite-database';

/**
 * SQLKeysRepository provides SQL-based storage for cryptographic keys.
 */
export class SQLKeysRepository implements IKeysRepository {
  private readonly database: NodeSQLiteDatabase;

  constructor(database: NodeSQLiteDatabase) {
    this.database = database;
  }

  async storeKeys(keys: {
    privateKey: PrivateKey;
    publicKey: v2.PublicKey;
  }): Promise<void> {
    try {
      await this.database.executeNonQuery(
        `INSERT OR REPLACE INTO keys (
          key_type, private_key, public_key
        ) VALUES (?, ?, ?)`,
        [
          keys.privateKey.keyType.toString(),
          keys.privateKey.key,
          keys.publicKey.key,
        ],
      );
    } catch (error) {
      throw new DatabaseError('Failed to store keys: ', error);
    }
  }

  async retrieveKeysByPublicKey(publicKey: v2.PublicKey): Promise<{
    privateKey: PrivateKey;
    publicKey: v2.PublicKey;
  } | null> {
    try {
      const results = await this.database.executeQuery<{
        key_type: string;
        private_key: Uint8Array;
        public_key: Uint8Array;
      }>(
        'SELECT key_type, private_key, public_key FROM keys WHERE public_key = ?',
        [publicKey.key],
      );

      if (results.length === 0) {
        return null;
      }

      const row = results[0];
      const kt = Number(row.key_type);
      return {
        privateKey: { keyType: kt, key: Uint8Array.from(row.private_key) },
        publicKey: v2.PublicKey.create({ keyType: kt, key: Uint8Array.from(row.public_key) }),
      };
    } catch (error) {
      throw new DatabaseError('Failed to retrieve keys by public key: ', error);
    }
  }

  getAllKeys(): Promise<{ privateKey: PrivateKey; publicKey: v2.PublicKey }[]> {
    throw new Error('Not yet implemented');
  }

  removeKeys(): Promise<void> {
    throw new Error('Not yet implemented');
  }
}

export async function _createSQLKeysRepository(
  database: NodeSQLiteDatabase,
): Promise<SQLKeysRepository> {
  await database.initialize();
  return new SQLKeysRepository(database);
}
