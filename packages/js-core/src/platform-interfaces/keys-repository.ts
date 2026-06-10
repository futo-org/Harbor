import type { KeyType, PublicKey } from '../proto/v2';

/**
 * One persisted key in the local key store.
 * If `private_key` is absent, the private key may be stored as
 * `encrypted_private_key` (browser) or in expo-secure-store (React Native).
 */
export interface PersistedKey {
  public_key: Uint8Array;
  key_type: KeyType;
  private_key?: Uint8Array;
  encrypted_private_key?: Uint8Array;
  credential_id?: Uint8Array;
}

/**
 * KeysRepository interface for storing and retrieving cryptographic keys.
 */
export interface IKeysRepository {
  getAllKeys(): Promise<PersistedKey[]>;

  get(publicKey: PublicKey): Promise<PersistedKey | null>;
  insert(key: PersistedKey): Promise<void>;
  delete(publicKey: PublicKey): Promise<void>;
}
