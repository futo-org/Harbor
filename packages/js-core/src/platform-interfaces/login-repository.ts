import type { KeyType, PrivateKey, PublicKey } from '../proto/v2';

export type LoginOverview = {
  identity: string;
  publicKey: PublicKey;
  status: LoginStatus;
};

export type LoginDetails = LoginOverview & {
  privateKey: PrivateKey;
};

// TODO: support expo secure storage option
export type PrivateKeyLocation = 'inline';

/**
 * The identity events are always the source of truth for a key, but our local
 * status for a key pair informs what events we should create or expect to
 * receive.
 */
export type LoginStatus =
  /**
   * This key pair in this login is being used to create a new identity but we
   * have not yet confirmed that the identity genesis event has been created
   * and persisted locally.
   */
  | 'pendingSignup'

  /**
   * This key pair in this login is being used to pair to an identity but we
   * have not yet confirmed that an identity chain authorizing it has been
   * persisted locally.
   */
  | 'pendingPair'

  /**
   * This key pair in this login is being used to recover an identity using a
   * backup, but we have not yet confirmed that the recovery identity event has
   * been created and persisted locally.
   */
  | 'pendingRecovery'

  /**
   * This login is believed to be authorized for signing events and rotating
   * the identity state.
   */
  | 'liveRotationKey'

  /**
   * This login is believed to be authorized for signing events.
   */
  | 'liveSigningKey'

  /**
   * This login is believed to be revoked.
   */
  | 'revoked'

  /**
   * We are in the process of deleting this login, but we have not yet
   * confirmed that the private key has been deleted.
   *
   * Logins with inline private keys should skip this status and just delete
   * row from the DB.
   * This status is most useful when the private key is stored elsewhere.
   *
   * Logins with this status should be handled by the next sweep and other
   * functions will ignore them.
   */
  | 'pendingDeletion';

/**
 * Barebones interface for storing logins that each platform should
 * implement.
 * A "login" consists of a keypair and an associated identity.
 * Application code should interface with the login store instead.
 *
 * Assume any function can throw unless specified otherwise.
 * Implementations should only throw instances of `LoginRepositoryError`.
 */
export interface ILoginRepository {
  /**
   * Insert a new login.
   * Fails if this identity already has a login with the same public key.
   */
  putLogin(
    identity: string,
    keyType: KeyType,
    publicKey: Uint8Array,
    privateKey: Uint8Array,
    status: LoginStatus,
  ): Promise<void>;

  /**
   * Update the status field of the login.
   */
  changeLoginStatus(
    identity: string,
    keyType: KeyType,
    publicKey: Uint8Array,
    newStatus: LoginStatus,
  ): Promise<void>;

  /**
   * List the logins, optionally filtered by the associated identity.
   */
  listLogins(identity?: string): Promise<LoginOverview[]>;

  /**
   * Retrieve a login along with its private key.
   */
  getLoginDetails(
    identity: string,
    keyType: KeyType,
    publicKey: Uint8Array,
  ): Promise<LoginDetails | null>;

  /**
   * Delete a login from the local repository.
   * This may not be atomic if the private key is not stored inline.
   */
  deleteLogin(
    identity: string,
    keyType: KeyType,
    publicKey: Uint8Array,
  ): Promise<void>;

  /**
   * Process any pending deletions and do cleanup.
   * This should be called periodically in case our process is killed while an
   * operation is partway through.
   */
  sweep(): Promise<void>;
}

/**
 * Login repository implementations should use these error codes.
 * Implementations may fall back to `'db'` even when a more specific error code
 * is applicable.
 */
export type LoginRepositoryErrorCode =
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

export class LoginRepositoryError extends Error {
  override readonly name = 'LoginRepositoryError';

  constructor(
    readonly code: LoginRepositoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
