/**
 * CryptoManager interface for cryptographic operations
 *
 * Key operations are async to allow for use of async
 * libraries such as WebCryptoAPI
 */
export interface ICryptoManager {
  /**
   * Generate a new key pair for the specified key type
   *
   * @param keyType - The type of key to generate (e.g., KEY_TYPE.ED25519)
   * @returns Promise that resolves to a key pair containing both private and public keys
   * @throws {Error} If the key type is not supported or key generation fails
   */
  generateKeyPair(
    keyType: number,
  ): Promise<{ privateKey: Uint8Array; publicKey: Uint8Array }>;

  /**
   * Derive the public key from a private key
   *
   * @param privateKey - The private key bytes
   * @param keyType - The type of key (e.g., KEY_TYPE.ED25519)
   * @returns Promise that resolves to the public key bytes
   * @throws {Error} If the key type is not supported or private key is invalid
   */
  derivePublicKey(privateKey: Uint8Array, keyType: number): Promise<Uint8Array>;

  /**
   * Sign a message with a private key
   *
   * @param privateType - The private key bytes
   * @param message - The message to sign
   * @param keyType - The type of key (e.g., KEY_TYPE.ED25519)
   * @returns Promise that resolves to the signature bytes
   * @throws {Error} If the key type is not supported or signing fails
   */
  sign(
    privateKey: Uint8Array,
    message: Uint8Array,
    keyType: number,
  ): Promise<Uint8Array>;

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
  verify(
    publicKey: Uint8Array,
    message: Uint8Array,
    signature: Uint8Array,
    keyType: number,
  ): Promise<boolean>;

  /**
   * Generate a random process ID
   *
   * Process ID's are generated as the first 16 bytes of an Ed25519 private key.
   * This is NOT the same private key used for a process.
   * The Ed25519 key is only used here to ensure randomness.
   *
   * @returns Promise that resolves to 16 random bytes
   */
  generateProcessId(): Promise<Uint8Array>;

  /**
   * Get the list of supported key types
   *
   * @returns Array of supported key type constants
   */
  getSupportedKeyTypes(): number[];

  /**
   * Convert a Uint8Array to hexadecimal string representation
   *
   * @param data - The byte array to convert
   * @returns Hexadecimal string representation (lowercase, no prefix)
   */
  toHex(data: Uint8Array): string;
}
