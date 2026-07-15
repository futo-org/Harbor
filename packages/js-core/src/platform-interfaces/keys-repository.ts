import type { PrivateKey } from '../polycentric-client';
import type { PublicKey } from '../proto/v2';

/**
 * KeysRepository interface for storing and retrieving cryptographic keys in a database
 */
export interface IKeysRepository {
  /**
   * Store a key pair
   *
   * @param keys - A key pair containing private and public keys
   * @throws {Error} If the keys are invalid or storing fails
   */
  storeKeys(keys: {
    privateKey: PrivateKey;
    publicKey: PublicKey;
  }): Promise<void>;

  /**
   * Retrieve a key pair by public key
   *
   * @param publicKey - The public key to look up
   * @returns Promise that resolves to the key pair, or null if not found
   */
  retrieveKeysByPublicKey(publicKey: PublicKey): Promise<{
    privateKey: PrivateKey;
    publicKey: PublicKey;
  } | null>;

  /**
   * Removes a key pair from storage
   *
   * @param publicKey The public key of the key pair to be removed
   * @throws {Error} If the keys are invalid or removal fails
   */
  removeKeys(publicKey: PublicKey): Promise<void>;

  /**
   * Gets all stored key pairs
   *
   * @returns Promise that resolves to a list of all stored key pairs
   */
  getAllKeys(): Promise<
    {
      privateKey: PrivateKey;
      publicKey: PublicKey;
    }[]
  >;
}
