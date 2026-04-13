import type { Database } from './database';
import {
  v2,
  type PrivateKey,
  type IKeysRepository,
} from '@polycentric/js-core';

export class KeysRepository implements IKeysRepository {
  constructor(private readonly database: Database) {}

  async storeKeys(keys: {
    privateKey: PrivateKey;
    publicKey: v2.PublicKey;
  }): Promise<void> {
    this.database.run(
      `INSERT OR REPLACE INTO identities (
        key_type, private_key, public_key, process_id
      ) VALUES (?, ?, ?, NULL)`,
      [Number(keys.privateKey.keyType), keys.privateKey.key, keys.publicKey.key]
    );
  }

  async retrieveKeysByPublicKey(publicKey: v2.PublicKey): Promise<{
    privateKey: PrivateKey;
    publicKey: v2.PublicKey;
  } | null> {
    const results = this.database.execute<{
      key_type: number;
      private_key: ArrayBuffer;
      public_key: ArrayBuffer;
    }>(
      'SELECT key_type, private_key, public_key FROM identities WHERE public_key = ?',
      [publicKey.key]
    );

    if (results.length === 0) {
      return null;
    }

    const row = results[0]!;
    const kt = Number(row.key_type);

    return {
      privateKey: { keyType: kt, key: new Uint8Array(row.private_key) },
      publicKey: v2.PublicKey.create({
        keyType: kt,
        key: new Uint8Array(row.public_key),
      }),
    };
  }

  async removeKeys(publicKey: v2.PublicKey): Promise<void> {
    this.database.run('DELETE FROM identities WHERE public_key = ?', [
      publicKey.key,
    ]);
  }

  async getAllKeys(): Promise<
    {
      privateKey: PrivateKey;
      publicKey: v2.PublicKey;
    }[]
  > {
    const results = this.database.execute<{
      key_type: number;
      private_key: ArrayBuffer;
      public_key: ArrayBuffer;
    }>('SELECT key_type, private_key, public_key FROM identities');

    return results.map((row) => {
      const kt = Number(row.key_type);
      return {
        privateKey: { keyType: kt, key: new Uint8Array(row.private_key) },
        publicKey: v2.PublicKey.create({
          keyType: kt,
          key: new Uint8Array(row.public_key),
        }),
      };
    });
  }
}
