import type { Database } from '../database';
import type { KeyPair } from '../../polycentric-client';
import { polycentric } from '../../generated/protocol';

export class IdentityRepository {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  store(identity: {
    privateKey: polycentric.PrivateKey;
    publicKey: polycentric.PublicKey;
    processId?: polycentric.IProcess;
  }): void {
    this.database.run(
      `INSERT OR REPLACE INTO identities (
        key_type, private_key, public_key, process_id
      ) VALUES (?, ?, ?, ?)`,
      [
        Number(identity.privateKey.keyType),
        identity.privateKey.key,
        identity.publicKey.key,
        identity.processId?.process ?? null,
      ]
    );
  }

  getByPublicKey(publicKey: polycentric.IPublicKey): KeyPair | null {
    const results = this.database.execute<{
      key_type: number;
      private_key: ArrayBuffer;
      public_key: ArrayBuffer;
      process_id: ArrayBuffer | null;
    }>(
      'SELECT key_type, private_key, public_key, process_id FROM identities WHERE public_key = ?',
      [publicKey.key]
    );

    if (results.length === 0) {
      return null;
    }

    const row = results[0]!;
    return {
      keyType: row.key_type,
      privateKey: polycentric.PrivateKey.create({
        keyType: row.key_type,
        key: new Uint8Array(row.private_key),
      }),
      publicKey: polycentric.PublicKey.create({
        keyType: row.key_type,
        key: new Uint8Array(row.public_key),
      }),
      processId: row.process_id
        ? polycentric.Process.create({
            process: new Uint8Array(row.process_id),
          })
        : undefined,
    };
  }

  remove(publicKey: polycentric.IPublicKey): void {
    this.database.run('DELETE FROM identities WHERE public_key = ?', [
      publicKey.key,
    ]);
  }

  getAll(): KeyPair[] {
    const results = this.database.execute<{
      key_type: number;
      private_key: ArrayBuffer;
      public_key: ArrayBuffer;
      process_id: ArrayBuffer | null;
    }>('SELECT key_type, private_key, public_key, process_id FROM identities');

    return results.map((row) => ({
      keyType: row.key_type,
      privateKey: polycentric.PrivateKey.create({
        keyType: row.key_type,
        key: new Uint8Array(row.private_key),
      }),
      publicKey: polycentric.PublicKey.create({
        keyType: row.key_type,
        key: new Uint8Array(row.public_key),
      }),
      processId: row.process_id
        ? polycentric.Process.create({
            process: new Uint8Array(row.process_id),
          })
        : undefined,
    }));
  }
}
