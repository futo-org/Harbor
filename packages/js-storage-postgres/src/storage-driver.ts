import { sql } from 'drizzle-orm';
import type { IStorageDriver, LoginId } from '@polycentric/js-core';
import { DatabaseError, v2 as Proto } from '@polycentric/js-core';
import { all, type PgDb } from './database.js';
import { EventRepository } from './repositories/event-repository.js';
import { LoginRepository } from './repositories/login-repository.js';

/**
 * Postgres-backed `IStorageDriver` built on Drizzle ORM. The database must
 * already be migrated with {@link migrate}.
 */
export class DrizzlePgStorageDriver implements IStorageDriver {
  /** @param db - A migrated Drizzle `node-postgres` database. */
  constructor(private readonly db: PgDb) {}

  /** Event repository over the `events` table. */
  createEventRepository() {
    return new EventRepository(this.db);
  }

  /** Login repository over the `logins` table. */
  createLoginRepository() {
    return new LoginRepository(this.db);
  }

  /**
   * Persist the active login. Throws `DatabaseError` if one is already stored
   * (identity switching is not yet supported), even when clearing with `null`.
   */
  async setActiveLogin(login: LoginId | null): Promise<void> {
    try {
      // TODO: remove this check and fix conflict behavior once we support
      // identity switching.
      // For now, we disallow changing the active identity once it is set.
      if (login) {
        const rows = await all(
          this.db,
          sql`
            INSERT INTO active_login (id, identity, key_type, public_key)
            VALUES (
              1, ${login.identity}, ${login.publicKey.keyType},
              ${Buffer.from(login.publicKey.key)}
            )
            ON CONFLICT DO NOTHING
            RETURNING id
          `,
        );

        if (rows.length === 0) {
          throw new DatabaseError('Already logged in.');
        }
      } else {
        const rows = await all(
          this.db,
          sql`SELECT id FROM active_login LIMIT 1`,
        );

        if (rows.length > 0) {
          throw new DatabaseError('Already logged in.');
        }
      }
    } catch (error) {
      throw new DatabaseError(`set active login: ${error}`, error);
    }
  }

  /** The stored active login, or `null` if none has been set. */
  async getActiveLogin(): Promise<LoginId | null> {
    try {
      const [row] = await all<{
        identity: string;
        key_type: number;
        public_key: Uint8Array;
      }>(
        this.db,
        sql`
          SELECT identity, key_type, public_key FROM active_login
          WHERE id = 1
        `,
      );

      if (!row) {
        return null;
      }

      return {
        identity: row.identity,
        publicKey: Proto.PublicKey.create({
          keyType: row.key_type,
          key: row.public_key,
        }),
      };
    } catch (error) {
      throw new DatabaseError(`get active login: ${error}`, error);
    }
  }
}
