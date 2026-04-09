import { ICryptoManager, KEY_TYPE } from '@polycentric/js-core';
import { ED25519KeyManager } from './ed25519-key-manager';

/**
 * BrowserCryptoManager provides cryptographic operations for the browser platform.
 *
 * This manager orchestrates multiple algorithm-specific managers and provides
 * a unified interface for crypto operations across different key types.
 */
export class BrowserCryptoManager implements ICryptoManager {
  private ed25519Manager = new ED25519KeyManager();

  /**
   * Generate a new key pair for the specified key type
   *
   * @param keyType - The type of key to generate (e.g., KEY_TYPE.ED25519)
   * @returns Promise that resolves to a key pair with private and public keys
   * @throws {Error} If the key type is not supported
   */
  async generateKeyPair(
    keyType: number,
  ): Promise<{ privateKey: Uint8Array; publicKey: Uint8Array }> {
    switch (keyType) {
      case KEY_TYPE.ED25519:
        return this.ed25519Manager.generateKeyPair();
      default:
        throw new Error(`Unsupported key type: ${keyType}`);
    }
  }

  /**
   * Derive the public key from a private key
   *
   * @param privateKey - The private key bytes
   * @param keyType - The type of key (e.g., KEY_TYPE.ED25519)
   * @returns Promise that resolves to the public key bytes
   * @throws {Error} If the key type is not supported or private key is invalid
   */
  async derivePublicKey(
    privateKey: Uint8Array,
    keyType: number,
  ): Promise<Uint8Array> {
    switch (keyType) {
      case KEY_TYPE.ED25519:
        return this.ed25519Manager.getPublicKeyFromPrivate(privateKey);
      default:
        throw new Error(`Unsupported key type: ${keyType}`);
    }
  }

  /**
   * Sign a message with a private key
   *
   * @param privateKey - The private key bytes
   * @param message - The message to sign
   * @param keyType - The type of key (e.g., KEY_TYPE.ED25519)
   * @returns Promise that resolves to the signature bytes
   * @throws {Error} If the key type is not supported or signing fails
   */
  async sign(
    privateKey: Uint8Array,
    message: Uint8Array,
    keyType: number,
  ): Promise<Uint8Array> {
    switch (keyType) {
      case KEY_TYPE.ED25519:
        return this.ed25519Manager.sign(message, privateKey);
      default:
        throw new Error(`Unsupported key type: ${keyType}`);
    }
  }

  /**
   * Verify a signature against a message and public key
   *
   * @param publicKey - The public key bytes
   * @param message - The original message
   * @param signature - The signature to verify
   * @param keyType - The type of key (e.g., KEY_TYPE.ED25519)
   * @returns Promise that resolves to true if signature is valid, false otherwise
   * @throws {Error} If the key type is not supported
   */
  async verify(
    publicKey: Uint8Array,
    message: Uint8Array,
    signature: Uint8Array,
    keyType: number,
  ): Promise<boolean> {
    switch (keyType) {
      case KEY_TYPE.ED25519:
        return this.ed25519Manager.verify(signature, message, publicKey);
      default:
        throw new Error(`Unsupported key type: ${keyType}`);
    }
  }

  /**
   * Generate a cryptographically secure random process ID
   *
   * Process IDs are 16 random bytes used to uniquely identify a process.
   * This implementation generates an ED25519 private key and takes the first 16 bytes.
   *
   * @returns Promise that resolves to 16 random bytes
   */
  async generateProcessId(): Promise<Uint8Array> {
    const privateKey = this.ed25519Manager.randomPrivateKey();
    return privateKey.slice(0, 16);
  }

  /**
   * Get the list of supported key types
   *
   * @returns Array of supported key type constants
   */
  getSupportedKeyTypes(): number[] {
    return [KEY_TYPE.ED25519];
  }

  /**
   * Convert a Uint8Array to hexadecimal string representation
   *
   * @param data - The byte array to convert
   * @returns Hexadecimal string representation (lowercase, no prefix)
   */
  toHex(data: Uint8Array): string {
    return Array.from(data)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
}
