import { ed25519 } from '@noble/curves/ed25519.js';
import { KEY_TYPE } from '../constants';
import { InvalidKeyLengthError, InvalidSignatureError } from '../errors';
import type { ICryptoManager } from '../platform-interfaces';

const ED25519_PRIVATE_KEY_LENGTH = 32;
const ED25519_PUBLIC_KEY_LENGTH = 32;
const ED25519_SIGNATURE_LENGTH = 64;

export class CryptoManager implements ICryptoManager {
  async generateKeyPair(
    keyType: number,
  ): Promise<{ privateKey: Uint8Array; publicKey: Uint8Array }> {
    this.assertEd25519(keyType);
    const privateKey = ed25519.utils.randomSecretKey();
    const publicKey = ed25519.getPublicKey(privateKey);
    return { privateKey, publicKey };
  }

  async derivePublicKey(
    privateKey: Uint8Array,
    keyType: number,
  ): Promise<Uint8Array> {
    this.assertEd25519(keyType);
    if (privateKey.length !== ED25519_PRIVATE_KEY_LENGTH) {
      throw new InvalidKeyLengthError(
        `Invalid private key length. Expected ${ED25519_PRIVATE_KEY_LENGTH} bytes, got ${privateKey.length}.`,
      );
    }
    return ed25519.getPublicKey(privateKey);
  }

  async sign(
    privateKey: Uint8Array,
    message: Uint8Array,
    keyType: number,
  ): Promise<Uint8Array> {
    this.assertEd25519(keyType);
    if (privateKey.length !== ED25519_PRIVATE_KEY_LENGTH) {
      throw new InvalidKeyLengthError(
        `Invalid private key length for signing. Expected ${ED25519_PRIVATE_KEY_LENGTH} bytes, got ${privateKey.length}.`,
      );
    }
    return ed25519.sign(message, privateKey);
  }

  async verify(
    publicKey: Uint8Array,
    message: Uint8Array,
    signature: Uint8Array,
    keyType: number,
  ): Promise<boolean> {
    this.assertEd25519(keyType);
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

  getSupportedKeyTypes(): number[] {
    return [KEY_TYPE.ED25519];
  }

  private assertEd25519(keyType: number): void {
    if (keyType !== KEY_TYPE.ED25519) {
      throw new Error(`Unsupported key type: ${keyType}`);
    }
  }
}
