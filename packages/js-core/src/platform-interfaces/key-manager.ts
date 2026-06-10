import { KEY_TYPE } from '../constants';
import type { PolycentricClient } from '../polycentric-client';
import type { PersistedKey } from './keys-repository';
import { PublicKey, type KeyType } from '../proto/v2';

/**
 * A key just generated or unlocked, with optional plaintext bytes still
 * in hand. Callers can sign with `unlockedPrivateKey` directly to avoid
 * a follow-up auth prompt. `unlockedWrappingKey` is a platform-specific
 * handle (browser: CryptoKey) for chained protected-key operations; it
 * is `unknown` on the shared type and must be cast where used.
 */
export interface UnlockedKey {
  persistedKey: PersistedKey;
  unlockedPrivateKey?: Uint8Array;
  unlockedWrappingKey?: unknown;
}

/**
 * Platform-specific owner of all key pair operations: storage,
 * generation (protected or unprotected), signing, and the device's
 * "active public key" pointer. Each platform extends
 * `AbstractKeyPairManager`.
 */
export interface IKeyPairManager {
  /** The pubkey this device is currently authoring as. */
  activePublicKey: PublicKey | null;

  /**
   * Populate `activePublicKey` from local storage when a platform has a
   * persisted active-key pointer.
   */
  loadActive(): Promise<void>;

  isProtectedAvailable(): Promise<boolean>;

  /**
   * Generate a new key pair.
   * If `protected` is false, the private key is persisted as plaintext.
   * If `protected` is true, the private key is persisted in a platform-specific secure storage.
   * TODO: `ephemeral` is only here for the protected-key demo so it doesn't
   * leave keys behind. Remove it when the demo is removed.
   */
  generate(
    keyType: KeyType,
    opts?: { protected?: boolean; ephemeral?: boolean },
  ): Promise<UnlockedKey>;

  /**
   * Sign `bytes` with `publicKey`, or with `activePublicKey` if omitted.
   * Throws if neither is available.
   */
  sign(bytes: Uint8Array, publicKey?: PublicKey): Promise<Uint8Array>;

  delete(publicKey: PublicKey): Promise<void>;

  runProtectedKeyPairDemo(): Promise<void>;
}

/**
 * Base class for platform KeyPairManagers. Owns the `activePublicKey`
 * field, the keys repository handle, and the demo entry point.
 * Subclasses implement platform-specific generate / sign / delete.
 */
export abstract class AbstractKeyPairManager implements IKeyPairManager {
  /**
   * TODO: Remove this in favor of an active identity linking to one or more
   * public key. Some logic still assumes a user's identity is a single public key
   * (as was the case before identities were introduced).
   */
  public activePublicKey: PublicKey | null = null;

  constructor(protected readonly client: PolycentricClient) {}

  /**
   * Just gets the first public key from the keys repository.
   * This is a placeholder until we get keys based on the active identity instead.
   */
  async loadActive(): Promise<void> {
    const all = await this.client.storage.keys.getAllKeys();
    // Temporary: use the first key with a plaintext private key
    // to prevent having a protected key as the active key.
    const first = all.find((key) => key.private_key);
    this.activePublicKey = first
      ? PublicKey.create({ keyType: first.key_type, key: first.public_key })
      : null;
  }

  abstract isProtectedAvailable(): Promise<boolean>;

  abstract generate(
    keyType: KeyType,
    opts?: { protected?: boolean; ephemeral?: boolean },
  ): Promise<UnlockedKey>;

  /**
   * Sign `bytes` with `publicKey`, or with `activePublicKey` if omitted.
   */
  abstract sign(bytes: Uint8Array, publicKey?: PublicKey): Promise<Uint8Array>;

  abstract delete(publicKey: PublicKey): Promise<void>;

  /**
   * TODO: Remove this when protected keys are actually used.
   * Generates an ephemeral protected key, signs a demo message with the
   * in-hand unlocked bytes.
   */
  async runProtectedKeyPairDemo(): Promise<void> {
    if (!(await this.isProtectedAvailable())) return;
    let unlocked: UnlockedKey;
    try {
      unlocked = await this.generate(KEY_TYPE.ED25519, {
        protected: true,
        ephemeral: true,
      });
    } catch (err) {
      console.warn('protected key demo: generate cancelled or failed', err);
      return;
    }
    try {
      if (!unlocked.unlockedPrivateKey) {
        throw new Error(
          'protected key demo: generate returned no unlocked bytes',
        );
      }
      await this.client.cryptoManager.sign(
        unlocked.unlockedPrivateKey,
        new TextEncoder().encode('demo'),
        unlocked.persistedKey.key_type,
      );
    } catch (err) {
      console.warn('protected key demo: sign cancelled or failed', err);
    }
  }
}
