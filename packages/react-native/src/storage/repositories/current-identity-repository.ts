import type { Database } from '../database';
import { polycentric } from '../../generated/protocol';

export class CurrentIdentityRepository {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  get(): polycentric.IPublicKey | null {
    const results = this.database.execute<{
      public_key: ArrayBuffer;
    }>('SELECT public_key FROM current_identity WHERE id = 1');

    if (results.length === 0) {
      return null;
    }

    return polycentric.PublicKey.create({
      key: new Uint8Array(results[0]!.public_key),
    });
  }

  set(publicKey: polycentric.IPublicKey): void {
    this.database.run(
      'INSERT OR REPLACE INTO current_identity (id, public_key) VALUES (1, ?)',
      [publicKey.key]
    );
  }

  clear(): void {
    this.database.run('DELETE FROM current_identity WHERE id = 1');
  }
}
