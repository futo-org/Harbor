import type { KeyType, PublicKey } from '../proto/v2';

export interface PrivateKey {
  keyType: KeyType;
  key: Uint8Array;
}

export interface KeyPair {
  keyType: KeyType;
  privateKey: PrivateKey;
  publicKey: PublicKey;
}

export type PersistedKey = {
  publicKey: PublicKey;
  identity: string;
  status: KeyPairStatus;
};

// TODO: support expo secure storage option
export type PrivateKeyLocation = 'inline';

/**
 * The identity events are always the source of truth for a key, but our local
 * status for a key pair informs what events we should create or expect to
 * receive.
 */
export type KeyPairStatus =
  /**
   * This key pair is being used to create a new identity but we have not yet
   * confirmed that the identity genesis event has been created and persisted
   * locally.
   */
  | 'pendingSignup'

  /**
   * This key pair is being used to pair to an identity but we have not yet
   * confirmed that an identity chain authorizing it has been persisted locally.
   */
  | 'pendingPair'

  /**
   * This key pair is being used to recover an identity using a backup, but we
   * have not yet confirmed that the recovery identity event has been created and
   * persisted locally.
   */
  | 'pendingRecovery'

  /**
   * This key pair is believed to be authorized as a rotation key.
   */
  | 'liveRotationKey'

  /**
   * This key pair is believed to be authorized as a signing key.
   */
  | 'liveSigningKey'

  /**
   * This keypair is believed to be revoked.
   */
  | 'revoked'

  /**
   * We are in the process of deleting this key pair, but we have not yet
   * confirmed that the private key has been deleted.
   *
   * Key pairs with inline private keys should skip this status and just delete
   * row from the DB.
   * This status is most useful when the private key is stored elsewhere.
   *
   * Key pairs with this status should be handled by the next sweep and other
   * functions will ignore them.
   */
  | 'pendingDeletion';

/**
 * "Low level" interface for storing key pairs that each platform should
 * implement.
 * Application code should interface with the key store instead.
 *
 * Assume any function can throw unless specified otherwise.
 * Implementations should only throw instances of `KeyRepositoryError`.
 */
export interface IKeyRepository {
  /**
   * Insert a new key pair.
   * Fails if there is already a key pair with the same public key present.
   */
  putKeyPair(
    keyPair: KeyPair,
    identity: string,
    status: KeyPairStatus,
  ): Promise<void>;

  /**
   * Update the status field of the key pair.
   * Fails if the status is set to `'pendingDeletion'`.
   */
  changeKeyStatus(
    publicKey: PublicKey,
    newStatus: KeyPairStatus,
  ): Promise<void>;

  /**
   * List the key pairs, optionally filtered by the associated identity.
   */
  listKeys(identity?: string): Promise<PersistedKey[]>;

  /**
   * Get the private key associated with a public key.
   */
  getPrivateKey(publicKey: PublicKey): Promise<PrivateKey | null>;

  /**
   * Delete a key pair from the local repository.
   * This may not be atomic if the private key is not stored inline.
   */
  deleteKeyPair(publicKey: PublicKey): Promise<void>;

  /**
   * Process any pending deletions and do cleanup.
   * This should be called periodically in case our process is killed while an
   * operation is partway through.
   */
  sweep(): Promise<void>;
}

/**
 * Key repository implementations should use these error codes.
 * Implementations may fall back to `'db'` even when a more specific error code
 * is applicable.
 */
export type KeyRepositoryErrorCode =
  | 'invalid key pair'
  | 'unsupported key type'
  | 'unsupported key location'
  | 'invalid identity key'
  | 'invalid status'
  | 'already exists'
  | 'not found'
  /** Generic error related to the private key storage provider. */
  | 'private key storage'
  /** Generic database error. */
  | 'db';

export class KeyRepositoryError extends Error {
  override readonly name = 'KeyRepositoryError';

  constructor(
    readonly code: KeyRepositoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
