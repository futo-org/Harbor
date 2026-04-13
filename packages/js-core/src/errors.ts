/**
 * Base error class for all Polycentric wrapper errors.
 *
 * This is the parent class for all custom errors thrown by the Polycentric
 * TypeScript wrapper. It provides consistent error handling and proper
 * prototype chain setup for instanceof checks.
 *
 * @example
 * ```typescript
 * try {
 *   // Some Polycentric operation
 * } catch (error) {
 *   if (error instanceof WrapperError) {
 *     console.log('Polycentric error:', error.message);
 *     if (error.originalError) {
 *       console.log('Original error:', error.originalError);
 *     }
 *   }
 * }
 * ```
 */
export class WrapperError extends Error {
  /**
   * Create a new WrapperError.
   *
   * @param message - Error message
   * @param originalError - Optional original error that caused this error
   */
  constructor(
    message: string,
    public originalError?: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, WrapperError.prototype);
    this.name = 'WrapperError';
  }
}

/**
 * Error thrown when a WASM operation fails.
 *
 * This error is thrown when a WASM operation fails.
 *
 * @example
 * ```typescript
 * try {
 *   await initializeWasm();
 * } catch (error) {
 *   if (error instanceof WASMError) {
 *     console.log('WASM error:', error.message);
 *   }
 * }
 * ```
 */
export class WasmError extends WrapperError {
  constructor(message: string, originalError?: unknown) {
    super(message, originalError);
    Object.setPrototypeOf(this, WasmError.prototype);
    this.name = 'WasmError';
  }
}

/**
 * Error thrown when a cryptographic key has an invalid length.
 *
 * This error is thrown when Ed25519 keys don't match the expected lengths:
 * - Private keys must be 32 bytes
 * - Public keys must be 32 bytes
 * - Signatures must be 64 bytes
 *
 * @example
 * ```typescript
 * try {
 *   keyManager.sign(message, invalidPrivateKey);
 * } catch (error) {
 *   if (error instanceof InvalidKeyLengthError) {
 *     console.log('Key length error:', error.message);
 *   }
 * }
 * ```
 */
export class InvalidKeyLengthError extends WrapperError {
  /**
   * Create a new InvalidKeyLengthError.
   *
   * @param message - Error message
   * @param originalError - Optional original error that caused this error
   */
  constructor(message: string, originalError?: unknown) {
    super(message, originalError);
    Object.setPrototypeOf(this, InvalidKeyLengthError.prototype);
    this.name = 'InvalidKeyLengthError';
  }
}

/**
 * Error thrown when a cryptographic signature has an invalid length.
 *
 * This error is thrown when Ed25519 signatures don't match the expected
 * 64-byte length during verification operations.
 *
 * @example
 * ```typescript
 * try {
 *   keyManager.verify(invalidSignature, message, publicKey);
 * } catch (error) {
 *   if (error instanceof InvalidSignatureError) {
 *     console.log('Signature length error:', error.message);
 *   }
 * }
 * ```
 */
export class InvalidSignatureError extends WrapperError {
  /**
   * Create a new InvalidSignatureError.
   *
   * @param message - Error message
   * @param originalError - Optional original error that caused this error
   */
  constructor(message: string, originalError?: unknown) {
    super(message, originalError);
    Object.setPrototypeOf(this, InvalidSignatureError.prototype);
    this.name = 'InvalidSignatureError';
  }
}

/**
 * Error thrown when encryption operations fail.
 *
 * This error is thrown when AES-GCM encryption fails during key storage
 * or other encryption operations in the EncryptedKeyStore.
 *
 * @example
 * ```typescript
 * try {
 *   await encryptedKeyStore.storeKey('myKey', keyData);
 * } catch (error) {
 *   if (error instanceof EncryptionError) {
 *     console.log('Encryption failed:', error.message);
 *     console.log('Original error:', error.originalError);
 *   }
 * }
 * ```
 */
export class EncryptionError extends WrapperError {
  /**
   * Create a new EncryptionError.
   *
   * @param message - Error message describing the encryption failure
   * @param originalError - Optional original error that caused the encryption failure
   */
  constructor(message: string, originalError?: unknown) {
    super(message, originalError);
    Object.setPrototypeOf(this, EncryptionError.prototype);
    this.name = 'EncryptionError';
  }
}

/**
 * Error thrown when decryption operations fail.
 *
 * This error is thrown when AES-GCM decryption fails during key retrieval
 * or other decryption operations in the EncryptedKeyStore. This can happen
 * due to wrong passwords, corrupted data, or tampered ciphertext.
 *
 * @example
 * ```typescript
 * try {
 *   const key = await encryptedKeyStore.retrieveKey('myKey');
 * } catch (error) {
 *   if (error instanceof DecryptionError) {
 *     console.log('Decryption failed:', error.message);
 *     console.log('Original error:', error.originalError);
 *   }
 * }
 * ```
 */
export class DecryptionError extends WrapperError {
  /**
   * Create a new DecryptionError.
   *
   * @param message - Error message describing the decryption failure
   * @param originalError - Optional original error that caused the decryption failure
   */
  constructor(message: string, originalError?: unknown) {
    super(message, originalError);
    Object.setPrototypeOf(this, DecryptionError.prototype);
    this.name = 'DecryptionError';
  }
}

/**
 * Error thrown when configuration is invalid or missing.
 *
 * This error is thrown when the Polycentric library is configured incorrectly,
 * such as missing required parameters, invalid database types, or other
 * configuration-related issues.
 *
 * @example
 * ```typescript
 * try {
 *   await polycentric.initialize({ database: { type: 'invalid-type' } });
 * } catch (error) {
 *   if (error instanceof ConfigurationError) {
 *     console.log('Configuration error:', error.message);
 *   }
 * }
 * ```
 */
export class ConfigurationError extends WrapperError {
  /**
   * Create a new ConfigurationError.
   *
   * @param message - Error message describing the configuration issue
   * @param originalError - Optional original error that caused the configuration failure
   */
  constructor(message: string, originalError?: unknown) {
    super(message, originalError);
    Object.setPrototypeOf(this, ConfigurationError.prototype);
    this.name = 'ConfigurationError';
  }
}

/**
 * Error thrown when database operations fail.
 *
 * This error is thrown when database operations such as queries, insertions,
 * or connection issues occur. It wraps the original database error for
 * better error handling and debugging.
 *
 * @example
 * ```typescript
 * try {
 *   await eventStore.storeSignedEvent(signedEvent);
 * } catch (error) {
 *   if (error instanceof DatabaseError) {
 *     console.log('Database error:', error.message);
 *     console.log('Original error:', error.originalError);
 *   }
 * }
 * ```
 */
export class DatabaseError extends WrapperError {
  /**
   * Create a new DatabaseError.
   *
   * @param message - Error message describing the database operation failure
   * @param originalError - Optional original error that caused the database failure
   */
  constructor(message: string, originalError?: unknown) {
    super(message, originalError);
    Object.setPrototypeOf(this, DatabaseError.prototype);
    this.name = 'DatabaseError';
  }
}

/**
 * Error thrown when query operations fail.
 *
 * This error is thrown when query engine operations fail, such as
 * ingesting events, executing queries, or retrieving statistics.
 * It wraps the underlying error for better debugging.
 *
 * @example
 * ```typescript
 * try {
 *   await queryEngine.queryLatest({ system: systemKey, contentType: 1n });
 * } catch (error) {
 *   if (error instanceof QueryError) {
 *     console.log('Query failed:', error.message);
 *     console.log('Original error:', error.originalError);
 *   }
 * }
 * ```
 */
export class QueryError extends WrapperError {
  /**
   * Create a new QueryError.
   *
   * @param message - Error message describing the query failure
   * @param originalError - Optional original error that caused the query failure
   */
  constructor(message: string, originalError?: unknown) {
    super(message, originalError);
    Object.setPrototypeOf(this, QueryError.prototype);
    this.name = 'QueryError';
  }
}

/**
 * Error thrown when an HTTP request fails.
 *
 * This error is thrown when an HTTP request fails, such as when a server
 * returns a non-200 status code.
 */
export class HTTPError extends WrapperError {
  constructor(message: string, originalError?: unknown) {
    super(message, originalError);
    Object.setPrototypeOf(this, HTTPError.prototype);
    this.name = 'HTTPError';
  }
}
