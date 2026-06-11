import { ed25519 } from '@noble/curves/ed25519.js';
import {
  InvalidKeyLengthError,
  InvalidSignatureError,
} from '@polycentric/js-core';

const ED25519_PRIVATE_KEY_LENGTH = 32;
const ED25519_PUBLIC_KEY_LENGTH = 32;
const ED25519_SIGNATURE_LENGTH = 64;

export interface Ed25519KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

/**
 * Browser-compatible cryptographic key manager for Ed25519 operations.
 */
export class ED25519KeyManager {
  /**
   * Generate a cryptographically secure random private key.
   *
   * @returns A new random 32-byte Ed25519 private key
   */
  randomPrivateKey(): Uint8Array {
    return ed25519.utils.randomSecretKey();
  }

  /**
   * Derive the public key from a private key.
   *
   * @param privateKey - The Ed25519 private key (32 bytes)
   * @returns The corresponding Ed25519 public key (32 bytes)
   * @throws {InvalidKeyLengthError} If the private key is not 32 bytes
   */
  getPublicKeyFromPrivate(privateKey: Uint8Array): Uint8Array {
    if (privateKey.length !== ED25519_PRIVATE_KEY_LENGTH) {
      throw new InvalidKeyLengthError(
        `Invalid private key length. Expected ${ED25519_PRIVATE_KEY_LENGTH} bytes, got ${privateKey.length}.`,
      );
    }
    return ed25519.getPublicKey(privateKey);
  }

  /**
   * Generate a new Ed25519 key pair with binary keys.
   *
   * @returns {Ed25519KeyPair} A new key pair with private and public keys as Uint8Array
   */
  generateKeyPair(): Ed25519KeyPair {
    const privateKey = this.randomPrivateKey();
    const publicKey = this.getPublicKeyFromPrivate(privateKey);
    return { privateKey, publicKey };
  }

  /**
   * Sign a message using an Ed25519 private key.
   *
   * @param message - The message to sign
   * @param privateKey - The Ed25519 private key (32 bytes)
   * @returns The Ed25519 signature (64 bytes)
   * @throws {InvalidKeyLengthError} If the private key is not 32 bytes
   */
  sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
    if (privateKey.length !== ED25519_PRIVATE_KEY_LENGTH) {
      throw new InvalidKeyLengthError(
        `Invalid private key length for signing. Expected ${ED25519_PRIVATE_KEY_LENGTH} bytes, got ${privateKey.length}.`,
      );
    }
    return ed25519.sign(message, privateKey);
  }

  /**
   * Verify an Ed25519 signature.
   *
   * @param signature - The signature to verify (64 bytes)
   * @param message - The original signed message
   * @param publicKey - The Ed25519 public key (32 bytes)
   * @returns True if the signature is valid, false otherwise
   * @throws {InvalidSignatureError} If the signature is not 64 bytes
   * @throws {InvalidKeyLengthError} If the public key is not 32 bytes
   */
  verify(
    signature: Uint8Array,
    message: Uint8Array,
    publicKey: Uint8Array,
  ): boolean {
    if (signature.length !== ED25519_SIGNATURE_LENGTH) {
      throw new InvalidSignatureError(
        `Invalid signature length. Expected ${ED25519_SIGNATURE_LENGTH} bytes, got ${signature.length}.`,
      );
    }
    if (publicKey.length !== ED25519_PUBLIC_KEY_LENGTH) {
      throw new InvalidKeyLengthError(
        `Invalid public key length for verification. Expected ${ED25519_PUBLIC_KEY_LENGTH} bytes, got ${publicKey.length}.`,
      );
    }
    return ed25519.verify(signature, message, publicKey);
  }
}
