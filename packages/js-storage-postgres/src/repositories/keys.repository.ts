import { sql } from 'drizzle-orm';
import {
  PublicKey,
  type IKeysRepository,
  type PrivateKey,
} from '@polycentric/js-core';
import { all, type PgDb } from '../database.js';

interface KeysRow {
  key_type: number;
  private_key: Uint8Array;
  public_key: Uint8Array;
}

const bytes = (value: Uint8Array): Buffer => Buffer.from(value);

export class KeysRepository implements IKeysRepository {
  constructor(private readonly db: PgDb) {}

  async storeKeys(pair: {
    privateKey: PrivateKey;
    publicKey: PublicKey;
  }): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO keys (public_key, key_type, private_key)
      VALUES (${bytes(pair.publicKey.key)}, ${pair.privateKey.keyType}, ${bytes(pair.privateKey.key)})
      ON CONFLICT (public_key) DO UPDATE SET
        key_type = EXCLUDED.key_type,
        private_key = EXCLUDED.private_key
    `);
  }

  async retrieveKeysByPublicKey(
    publicKey: PublicKey,
  ): Promise<{ privateKey: PrivateKey; publicKey: PublicKey } | null> {
    const rows = await all<Pick<KeysRow, 'key_type' | 'private_key'>>(
      this.db,
      sql`
        SELECT key_type, private_key FROM keys
        WHERE public_key = ${bytes(publicKey.key)}
        LIMIT 1
      `,
    );
    const row = rows[0];
    if (!row) return null;
    return {
      privateKey: { keyType: row.key_type, key: row.private_key },
      publicKey: PublicKey.create({
        keyType: row.key_type,
        key: publicKey.key,
      }),
    };
  }

  async removeKeys(publicKey: PublicKey): Promise<void> {
    await this.db.execute(sql`
      DELETE FROM keys WHERE public_key = ${bytes(publicKey.key)}
    `);
  }

  async getAllKeys(): Promise<
    { privateKey: PrivateKey; publicKey: PublicKey }[]
  > {
    const rows = await all<KeysRow>(
      this.db,
      sql`SELECT key_type, private_key, public_key FROM keys`,
    );
    return rows.map((r) => ({
      privateKey: { keyType: r.key_type, key: r.private_key },
      publicKey: PublicKey.create({ keyType: r.key_type, key: r.public_key }),
    }));
  }
}
