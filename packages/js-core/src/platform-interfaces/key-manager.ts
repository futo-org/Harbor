import type { PersistedKey } from './keys-repository';
import type { KeyType, PublicKey } from '../proto/v2';

/**
 * A key just generated or unlocked, with optional plaintext bytes still
 * in hand. Callers can sign with `unlockedPrivateKey` directly to avoid
 * a follow-up auth prompt.
 */
export interface UnlockedKey {
  persistedKey: PersistedKey;
  isProtected: boolean;
  unlockedPrivateKey?: Uint8Array;
}

/**
 * Platform-specific owner of all key pair operations: storage,
 * generation (protected or unprotected), and signing. Each platform extends
 * `AbstractKeyPairManager`.
 */
export interface IKeyPairManager {
  isProtectedAvailable(): Promise<boolean>;

  /** Generate a new key pair, using protected storage when requested. */
  generate(
    keyType: KeyType,
    opts?: { protected?: boolean; strict?: boolean },
  ): Promise<UnlockedKey>;

  /** Sign `bytes` with `publicKey`. Throws if the key is unavailable. */
  sign(bytes: Uint8Array, publicKey: PublicKey): Promise<Uint8Array>;

  /** Unlock a locally-held key, prompting for protected keys. */
  unlock(publicKey: PublicKey): Promise<UnlockedKey | null>;

  /** Move a locally-held key into or out of platform secure storage. */
  setProtected(publicKey: PublicKey, protect: boolean): Promise<void>;

  delete(publicKey: PublicKey): Promise<void>;
}
