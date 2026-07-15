import type { IKeysRepository } from '../platform-interfaces';
import type { PrivateKey } from '../polycentric-client';
import type { PublicKey } from '../proto/v2';

/**
 * KeysStore provides operations for managing cryptographic keys.
 *
 * KeysStore wraps an IKeysRepository and provides business logic validation.
 */
export class KeysStore {
  constructor(private repository: IKeysRepository) {}

  /**
   * Store a key pair
   *
   * @param keys - A key pair to store
   */
  async storeKeys(keys: {
    privateKey: PrivateKey;
    publicKey: PublicKey;
  }): Promise<void> {
    // TODO: Business logic validation.

    await this.repository.storeKeys(keys);
  }

  /**
   * Retrieve a key pair by public key
   *
   * @param publicKey - The public key to look up
   * @returns Promise that resolves to the key pair, or null if not found
   */
  async retrieveKeysByPublicKey(publicKey: PublicKey): Promise<{
    privateKey: PrivateKey;
    publicKey: PublicKey;
  } | null> {
    // TODO: Business logic validation.

    return await this.repository.retrieveKeysByPublicKey(publicKey);
  }

  /**
   * Removes a key pair from storage
   *
   * @param publicKey The public key of the key pair to be removed
   * @throws {Error} If the keys are invalid or removal fails
   */
  async removeKeys(publicKey: PublicKey): Promise<void> {
    // TODO: Business logic validation.

    await this.repository.removeKeys(publicKey);
  }

  /**
   * Gets all stored key pairs
   *
   * @returns Promise that resolves to a list of all stored key pairs
   */
  async getAllKeys(): Promise<
    {
      privateKey: PrivateKey;
      publicKey: PublicKey;
    }[]
  > {
    // TODO: Business logic validation.

    return await this.repository.getAllKeys();
  }
}
