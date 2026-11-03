import { sql } from 'drizzle-orm';
import type {
  ILoginRepository,
  KeyType,
  LoginDetails,
  LoginOverview,
  LoginStatus,
} from '@polycentric/js-core';
import { LoginRepositoryError, v2 as Proto } from '@polycentric/js-core';
import type { SqliteDb } from '../database.js';

interface LoginRow {
  identity: string;
  key_type: number;
  public_key: Uint8Array;
  status: string;
  private_key_location: string;
  private_key: Uint8Array | null;
  private_key_token: string | null;
}

/**
 * LoginRepository provides SQLite-based storage for logins.
 *
 * Inputs are trusted; validation is the responsibility of the login store.
 */
export class LoginRepository implements ILoginRepository {
  constructor(private readonly db: SqliteDb) {}

  async putLogin(
    identity: string,
    keyType: KeyType,
    publicKey: Uint8Array,
    privateKey: Uint8Array,
    status: LoginStatus,
  ): Promise<void> {
    try {
      const rows = await this.db.all(sql`
        INSERT INTO logins (
          identity, key_type, public_key, status, private_key_location,
          private_key
        )
        VALUES (
          ${identity}, ${keyType}, ${publicKey}, ${status}, 'inline',
          ${privateKey}
        )
        ON CONFLICT DO NOTHING
        RETURNING 1
      `);

      if (rows.length === 0) {
        throw new LoginRepositoryError(
          'already exists',
          'login already exists',
        );
      }
    } catch (error) {
      throw toLoginRepositoryError('put login', error);
    }
  }

  async changeLoginStatus(
    identity: string,
    keyType: KeyType,
    publicKey: Uint8Array,
    newStatus: LoginStatus,
  ): Promise<void> {
    try {
      const rows = await this.db.all(sql`
        UPDATE logins SET status = ${newStatus}
        WHERE identity = ${identity}
          AND key_type = ${keyType}
          AND public_key = ${publicKey}
          AND status <> 'pendingDeletion'
        RETURNING 1
      `);

      if (rows.length === 0) {
        throw new LoginRepositoryError('not found', 'login not found');
      }
    } catch (error) {
      throw toLoginRepositoryError('change login status', error);
    }
  }

  async listLogins(identity?: string): Promise<LoginOverview[]> {
    try {
      const filter =
        identity === undefined ? sql`` : sql`AND identity = ${identity}`;

      const rows = await this.db.all<
        Pick<LoginRow, 'identity' | 'key_type' | 'public_key' | 'status'>
      >(sql`
        SELECT identity, key_type, public_key, status FROM logins
        WHERE status <> 'pendingDeletion' ${filter}
      `);

      return rows.map((row) => ({
        publicKey: Proto.PublicKey.create({
          keyType: row.key_type,
          key: row.public_key,
        }),
        identity: row.identity,
        status: row.status as LoginStatus,
      }));
    } catch (error) {
      throw toLoginRepositoryError('list logins', error);
    }
  }

  async getLoginDetails(
    identity: string,
    keyType: KeyType,
    publicKey: Uint8Array,
  ): Promise<LoginDetails | null> {
    try {
      const [row] = await this.db.all<LoginRow>(sql`
        SELECT * FROM logins
        WHERE identity = ${identity}
          AND key_type = ${keyType}
          AND public_key = ${publicKey}
          AND status <> 'pendingDeletion'
        LIMIT 1
      `);

      if (!row) {
        return null;
      }

      if (row.private_key_location !== 'inline') {
        throw new LoginRepositoryError(
          'unsupported key location',
          `unsupported private key location: ${row.private_key_location}`,
        );
      }

      if (row.private_key === null) {
        throw new LoginRepositoryError(
          'private key storage',
          'inline private key is missing',
        );
      }

      return {
        identity: row.identity,
        publicKey: Proto.PublicKey.create({
          keyType: row.key_type,
          key: row.public_key,
        }),
        status: row.status as LoginStatus,
        privateKey: Proto.PrivateKey.create({
          keyType: row.key_type,
          key: row.private_key,
        }),
      };
    } catch (error) {
      throw toLoginRepositoryError('get login details', error);
    }
  }

  async deleteLogin(
    identity: string,
    keyType: KeyType,
    publicKey: Uint8Array,
  ): Promise<void> {
    try {
      await this.db.run(sql`
        DELETE FROM logins
        WHERE identity = ${identity}
          AND key_type = ${keyType}
          AND public_key = ${publicKey}
      `);
    } catch (error) {
      throw toLoginRepositoryError('delete login', error);
    }
  }

  async sweep(): Promise<void> {
    try {
      // TODO: real deletion logic for secure storage keys when they're supported
      await this.db.run(sql`
        DELETE FROM logins WHERE status = 'pendingDeletion'
      `);
    } catch (error) {
      throw toLoginRepositoryError('sweep logins', error);
    }
  }
}

function toLoginRepositoryError(
  message: string,
  error: unknown,
): LoginRepositoryError {
  if (error instanceof LoginRepositoryError) {
    return error;
  }
  return new LoginRepositoryError('db', `${message}: ${error}`, {
    cause: error,
  });
}
