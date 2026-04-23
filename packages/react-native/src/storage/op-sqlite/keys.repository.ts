import type { IKeysRepository, PrivateKey } from '@polycentric/js-core';
import { v2 } from '@polycentric/js-core';
import type { Database } from './database';

export class KeysRepository implements IKeysRepository {
  constructor(private readonly database: Database) {}

  async storeKeys(keys: {
    privateKey: PrivateKey;
    publicKey: v2.PublicKey;
  }): Promise<void> {
    const keyType = keys.privateKey.keyType;
    const privateKey = keys.privateKey.key;
    const publicKey = keys.publicKey.key;

    this.database.run(
      `INSERT OR REPLACE INTO keys (public_key, key_type, private_key)
       VALUES (?, ?, ?)`,
      [publicKey, keyType, privateKey]
    );
  }

  async retrieveKeysByPublicKey(publicKey: v2.PublicKey): Promise<{
    privateKey: PrivateKey;
    publicKey: v2.PublicKey;
  } | null> {
    const rows = this.database.execute<{
      key_type: number;
      private_key: ArrayBuffer;
    }>(`SELECT key_type, private_key FROM keys WHERE public_key = ?`, [
      publicKey.key,
    ]);

    if (rows.length === 0) return null;

    const row = rows[0]!;
    return {
      privateKey: {
        keyType: row.key_type,
        key: new Uint8Array(row.private_key),
      },
      publicKey: v2.PublicKey.create({
        keyType: row.key_type,
        key: new Uint8Array(publicKey.key),
      }),
    };
  }

  async removeKeys(publicKey: v2.PublicKey): Promise<void> {
    this.database.run(`DELETE FROM keys WHERE public_key = ?`, [publicKey.key]);
  }

  async getAllKeys(): Promise<
    {
      privateKey: PrivateKey;
      publicKey: v2.PublicKey;
    }[]
  > {
    const rows = this.database.execute<{
      key_type: number;
      private_key: ArrayBuffer;
      public_key: ArrayBuffer;
    }>(`SELECT key_type, private_key, public_key FROM keys`);

    return rows.map((row) => ({
      privateKey: {
        keyType: row.key_type,
        key: new Uint8Array(row.private_key),
      },
      publicKey: v2.PublicKey.create({
        keyType: row.key_type,
        key: new Uint8Array(row.public_key),
      }),
    }));
  }
}
