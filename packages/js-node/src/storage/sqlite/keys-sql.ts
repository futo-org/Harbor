import type { IKeysRepository } from '@polycentric/js-core';
import { PrivateKey, PublicKey, DatabaseError } from '@polycentric/js-core';
import { NodeSQLiteDatabase } from './sqlite-database';

/**
 * SQLKeysRepository provides SQL-based storage for cryptographic keys.
 */
export class SQLKeysRepository implements IKeysRepository {
  private readonly database: NodeSQLiteDatabase;

  /**
   * Create a new SQLKeysRepository instance
   *
   * @param database - Database instance
   */
  constructor(database: NodeSQLiteDatabase) {
    this.database = database;
  }

  /**
   * Store a key pair in the database.
   *
   * @param keys - A key pair to store
   * @throws {DatabaseError} If the keys are invalid or storing fails
   */
  async storeKeys(keys: {
    privateKey: PrivateKey;
    publicKey: PublicKey;
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

  /**
   * Retrieve a key pair by public key.
   *
   * @param publicKey - The public key to look up
   * @returns Promise that resolves to the key pair, or null if not found
   */
  async retrieveKeysByPublicKey(publicKey: PublicKey): Promise<{
    privateKey: PrivateKey;
    publicKey: PublicKey;
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
      return {
        privateKey: PrivateKey.create({
          keyType: BigInt(row.key_type),
          key: Uint8Array.from(row.private_key),
        }),
        publicKey: PublicKey.create({
          keyType: BigInt(row.key_type),
          key: Uint8Array.from(row.public_key),
        }),
      };
    } catch (error) {
      throw new DatabaseError('Failed to retrieve keys by public key: ', error);
    }
  }

  getAllKeys(): Promise<{ privateKey: PrivateKey; publicKey: PublicKey }[]> {
    throw new Error('Not yet implemented');
  }

  removeKeys(): Promise<void> {
    throw new Error('Not yet implemented');
  }
}

/**
 * Create a new SQLKeysRepository with an initialized database.
 *
 * This method creates a standalone keys repository. It allows for
 * simpler isolation for testing purposes.
 *
 * This method should not be used in practice.
 * In practice create a BrowserStorage instance.
 *
 * @param database - Database instance for storing keys
 * @returns Promise that resolves to an initialized SQLKeysRepository
 * @throws {Error} If database initialization fails
 */
export async function _createSQLKeysRepository(
  database: NodeSQLiteDatabase,
): Promise<SQLKeysRepository> {
  await database.initialize();
  return new SQLKeysRepository(database);
}
