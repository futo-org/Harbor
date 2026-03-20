import 'react-native-get-random-values';
import { ed25519 } from '@noble/curves/ed25519';
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

export class ED25519KeyManager {
  randomPrivateKey(): Uint8Array {
    return ed25519.utils.randomPrivateKey();
  }

  getPublicKeyFromPrivate(privateKey: Uint8Array): Uint8Array {
    if (privateKey.length !== ED25519_PRIVATE_KEY_LENGTH) {
      throw new InvalidKeyLengthError(
        `Invalid private key length. Expected ${ED25519_PRIVATE_KEY_LENGTH} bytes, got ${privateKey.length}.`
      );
    }
    return ed25519.getPublicKey(privateKey);
  }

  generateKeyPair(): Ed25519KeyPair {
    const privateKey = this.randomPrivateKey();
    const publicKey = this.getPublicKeyFromPrivate(privateKey);
    return { privateKey, publicKey };
  }

  sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
    if (privateKey.length !== ED25519_PRIVATE_KEY_LENGTH) {
      throw new InvalidKeyLengthError(
        `Invalid private key length for signing. Expected ${ED25519_PRIVATE_KEY_LENGTH} bytes, got ${privateKey.length}.`
      );
    }
    return ed25519.sign(message, privateKey);
  }

  verify(
    signature: Uint8Array,
    message: Uint8Array,
    publicKey: Uint8Array
  ): boolean {
    if (signature.length !== ED25519_SIGNATURE_LENGTH) {
      throw new InvalidSignatureError(
        `Invalid signature length. Expected ${ED25519_SIGNATURE_LENGTH} bytes, got ${signature.length}.`
      );
    }
    if (publicKey.length !== ED25519_PUBLIC_KEY_LENGTH) {
      throw new InvalidKeyLengthError(
        `Invalid public key length for verification. Expected ${ED25519_PUBLIC_KEY_LENGTH} bytes, got ${publicKey.length}.`
      );
    }
    return ed25519.verify(signature, message, publicKey);
  }
}
