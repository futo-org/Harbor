import { sql } from 'drizzle-orm';
import {
  PublicKey,
  type IKeysRepository,
  type PrivateKey,
} from '@polycentric/js-core';
import type { SqliteDb } from '../database.js';

interface KeysRow {
  key_type: number;
  private_key: Uint8Array;
  public_key: Uint8Array;
}

export class KeysRepository implements IKeysRepository {
  constructor(private readonly db: SqliteDb) {}

  async storeKeys(pair: {
    privateKey: PrivateKey;
    publicKey: PublicKey;
  }): Promise<void> {
    await this.db.run(sql`
      INSERT INTO keys (public_key, key_type, private_key)
      VALUES (${pair.publicKey.key}, ${pair.privateKey.keyType}, ${pair.privateKey.key})
      ON CONFLICT(public_key) DO UPDATE SET
        key_type = excluded.key_type,
        private_key = excluded.private_key
    `);
  }

  async retrieveKeysByPublicKey(
    publicKey: PublicKey,
  ): Promise<{ privateKey: PrivateKey; publicKey: PublicKey } | null> {
    const rows = await this.db.all<
      Pick<KeysRow, 'key_type' | 'private_key'>
    >(sql`
      SELECT key_type, private_key FROM keys
      WHERE public_key = ${publicKey.key}
      LIMIT 1
    `);
    if (rows.length === 0) return null;
    const row = rows[0]!;
    return {
      privateKey: { keyType: row.key_type, key: row.private_key },
      publicKey: PublicKey.create({
        keyType: row.key_type,
        key: publicKey.key,
      }),
    };
  }

  async removeKeys(publicKey: PublicKey): Promise<void> {
    await this.db.run(sql`
      DELETE FROM keys WHERE public_key = ${publicKey.key}
    `);
  }

  async getAllKeys(): Promise<
    { privateKey: PrivateKey; publicKey: PublicKey }[]
  > {
    const rows = await this.db.all<KeysRow>(sql`
      SELECT key_type, private_key, public_key FROM keys
    `);
    return rows.map((r) => ({
      privateKey: { keyType: r.key_type, key: r.private_key },
      publicKey: PublicKey.create({ keyType: r.key_type, key: r.public_key }),
    }));
  }
}
