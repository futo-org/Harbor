import type {
  IKeyRepository,
  KeyPair,
  KeyPairStatus,
  PersistedKey,
  PrivateKey,
} from '../platform-interfaces/key-repository';
import { KeyRepositoryError } from '../platform-interfaces/key-repository';
import { KeyType, type PublicKey } from '../proto/v2';

const ED25519_PUBLIC_KEY_LENGTH = 32;
const ED25519_PRIVATE_KEY_LENGTH = 32;

/** 32 bytes, lowercase hex. */
const IDENTITY_PATTERN = /^[0-9a-f]{64}$/;

function assertIdentity(identity: string): void {
  if (!IDENTITY_PATTERN.test(identity)) {
    throw new KeyRepositoryError(
      'invalid identity key',
      'identity must be a 32 byte lowercase hex string',
    );
  }
}

function assertSupportedKeyType(keyType: KeyType): void {
  if (keyType !== KeyType.ED25519) {
    throw new KeyRepositoryError(
      'unsupported key type',
      `unsupported key type: ${keyType}`,
    );
  }
}

function assertPublicKey(publicKey: PublicKey): void {
  assertSupportedKeyType(publicKey.keyType);
  if (publicKey.key.length !== ED25519_PUBLIC_KEY_LENGTH) {
    throw new KeyRepositoryError(
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
    throw new KeyRepositoryError(
      'invalid key pair',
      'key types within the key pair do not match',
    );
  }
  if (keyPair.publicKey.key.length !== ED25519_PUBLIC_KEY_LENGTH) {
    throw new KeyRepositoryError(
      'invalid key pair',
      `public key must be ${ED25519_PUBLIC_KEY_LENGTH} bytes`,
    );
  }
  if (keyPair.privateKey.key.length !== ED25519_PRIVATE_KEY_LENGTH) {
    throw new KeyRepositoryError(
      'invalid key pair',
      `private key must be ${ED25519_PRIVATE_KEY_LENGTH} bytes`,
    );
  }
}

/**
 * KeyStore wraps a platform's key repository with shared input validation.
 * All functions throw `KeyRepositoryError` on failure.
 */
export class KeyStore {
  constructor(private readonly repository: IKeyRepository) {}

  /**
   * Insert a new key pair.
   * Fails if this identity already has a key pair with the same public key.
   */
  async putKeyPair(
    identity: string,
    keyPair: KeyPair,
    status: KeyPairStatus,
  ): Promise<void> {
    assertIdentity(identity);
    assertKeyPair(keyPair);

    await this.repository.putKeyPair(
      identity,
      keyPair.keyType,
      keyPair.publicKey.key,
      keyPair.privateKey.key,
      status,
    );
  }

  /**
   * Update the status field of the key pair.
   * Fails if the status is set to `'pendingDeletion'`.
   */
  async changeKeyStatus(
    identity: string,
    publicKey: PublicKey,
    newStatus: KeyPairStatus,
  ): Promise<void> {
    assertIdentity(identity);
    assertPublicKey(publicKey);

    await this.repository.changeKeyStatus(
      identity,
      publicKey.keyType,
      publicKey.key,
      newStatus,
    );
  }

  /**
   * List the key pairs, optionally filtered by the associated identity.
   */
  async listKeys(identity?: string): Promise<PersistedKey[]> {
    if (identity !== undefined) {
      assertIdentity(identity);
    }

    return this.repository.listKeys(identity);
  }

  /**
   * Get the private key associated with a public key.
   */
  async getPrivateKey(
    identity: string,
    publicKey: PublicKey,
  ): Promise<PrivateKey | null> {
    assertIdentity(identity);
    assertPublicKey(publicKey);

    return this.repository.getPrivateKey(
      identity,
      publicKey.keyType,
      publicKey.key,
    );
  }

  /**
   * Delete a key pair from the local repository.
   * This may not be atomic if the private key is not stored inline.
   */
  async deleteKeyPair(identity: string, publicKey: PublicKey): Promise<void> {
    assertIdentity(identity);
    assertPublicKey(publicKey);

    await this.repository.deleteKeyPair(
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
