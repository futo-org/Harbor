import type { KeyPair } from '../polycentric-client';
import type {
  ILoginRepository,
  LoginDetails,
  LoginOverview,
  LoginStatus,
} from '../platform-interfaces/login-repository';
import { LoginRepositoryError } from '../platform-interfaces/login-repository';
import { KeyType, type PublicKey } from '../proto/v2';

const ED25519_PUBLIC_KEY_LENGTH = 32;
const ED25519_PRIVATE_KEY_LENGTH = 32;

/** 32 bytes, lowercase hex. */
const IDENTITY_PATTERN = /^[0-9a-f]{64}$/;

function assertIdentity(identity: string): void {
  if (!IDENTITY_PATTERN.test(identity)) {
    throw new LoginRepositoryError(
      'invalid identity key',
      'identity must be a 32 byte lowercase hex string',
    );
  }
}

function assertSupportedKeyType(keyType: KeyType): void {
  if (keyType !== KeyType.ED25519) {
    throw new LoginRepositoryError(
      'unsupported key type',
      `unsupported key type: ${keyType}`,
    );
  }
}

function assertPublicKey(publicKey: PublicKey): void {
  assertSupportedKeyType(publicKey.keyType);
  if (publicKey.key.length !== ED25519_PUBLIC_KEY_LENGTH) {
    throw new LoginRepositoryError(
      'invalid key pair',
      `public key must be ${ED25519_PUBLIC_KEY_LENGTH} bytes`,
    );
  }
}

function assertKeyPair(keyPair: KeyPair): void {
  assertSupportedKeyType(keyPair.keyType);
  if (
    keyPair.publicKey.keyType !== keyPair.keyType ||
    keyPair.privateKey.keyType !== keyPair.keyType
  ) {
    throw new LoginRepositoryError(
      'invalid key pair',
      'key types within the key pair do not match',
    );
  }
  if (keyPair.publicKey.key.length !== ED25519_PUBLIC_KEY_LENGTH) {
    throw new LoginRepositoryError(
      'invalid key pair',
      `public key must be ${ED25519_PUBLIC_KEY_LENGTH} bytes`,
    );
  }
  if (keyPair.privateKey.key.length !== ED25519_PRIVATE_KEY_LENGTH) {
    throw new LoginRepositoryError(
      'invalid key pair',
      `private key must be ${ED25519_PRIVATE_KEY_LENGTH} bytes`,
    );
  }
}

/**
 * LoginStore wraps a platform's login repository with shared input validation.
 * A "login" consists of a key pair and its associated identity.
 * All functions throw `LoginRepositoryError` on failure.
 */
export class LoginStore {
  constructor(private readonly repository: ILoginRepository) {}

  /**
   * Insert a new login.
   * Fails if this identity already has a login with the same public key.
   */
  async putLogin(
    identity: string,
    keyPair: KeyPair,
    status: LoginStatus,
  ): Promise<void> {
    assertIdentity(identity);
    assertKeyPair(keyPair);

    await this.repository.putLogin(
      identity,
      keyPair.keyType,
      keyPair.publicKey.key,
      keyPair.privateKey.key,
      status,
    );
  }

  /**
   * Update the status field of the login.
   */
  async changeLoginStatus(
    identity: string,
    publicKey: PublicKey,
    newStatus: LoginStatus,
  ): Promise<void> {
    assertIdentity(identity);
    assertPublicKey(publicKey);

    await this.repository.changeLoginStatus(
      identity,
      publicKey.keyType,
      publicKey.key,
      newStatus,
    );
  }

  /**
   * List the logins, optionally filtered by the associated identity.
   */
  async listLogins(identity?: string): Promise<LoginOverview[]> {
    if (identity !== undefined) {
      assertIdentity(identity);
    }

    return this.repository.listLogins(identity);
  }

  /**
   * Retrieve a login along with its private key.
   * Returns `null` if the login does not exist.
   */
  async getLoginDetails(
    identity: string,
    publicKey: PublicKey,
  ): Promise<LoginDetails | null> {
    assertIdentity(identity);
    assertPublicKey(publicKey);

    return this.repository.getLoginDetails(
      identity,
      publicKey.keyType,
      publicKey.key,
    );
  }

  /**
   * Delete a login from the local repository.
   * This may not be atomic if the private key is not stored inline.
   */
  async deleteLogin(identity: string, publicKey: PublicKey): Promise<void> {
    assertIdentity(identity);
    assertPublicKey(publicKey);

    await this.repository.deleteLogin(
      identity,
      publicKey.keyType,
      publicKey.key,
    );
  }

  /**
   * Process any pending deletions and do cleanup.
   * This should be called periodically in case our process is killed while an
   * operation is partway through.
   */
  async sweep(): Promise<void> {
    await this.repository.sweep();
  }
}
