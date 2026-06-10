import { IKeysRepository, PersistedKey } from '../platform-interfaces';
import { PublicKey } from '../proto/v2';

/**
 * KeysStore provides operations for managing cryptographic keys.
 *
 * KeysStore wraps an IKeysRepository and provides business logic validation.
 */
export class KeysStore {
  constructor(private repository: IKeysRepository) {}

  /**
   * Gets all persisted keys.
   */
  async getAllKeys(): Promise<PersistedKey[]> {
    return await this.repository.getAllKeys();
  }

  /**
   * Get the `PersistedKey` for a public key, or null if not found.
   */
  async get(publicKey: PublicKey): Promise<PersistedKey | null> {
    return this.repository.get(publicKey);
  }

  /**
   * Insert or update a `PersistedKey`.
   */
  async insert(key: PersistedKey): Promise<void> {
    await this.repository.insert(key);
  }

  /**
   * Delete a key by public key.
   */
  async delete(publicKey: PublicKey): Promise<void> {
    await this.repository.delete(publicKey);
  }
}
