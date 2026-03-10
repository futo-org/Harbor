import 'react-native-get-random-values';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';

ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));
ed.etc.sha512Async = async (...m: Uint8Array[]) =>
  sha512(ed.etc.concatBytes(...m));

const ED25519_PRIVATE_KEY_LENGTH = 32;
const ED25519_PUBLIC_KEY_LENGTH = 32;
const ED25519_SIGNATURE_LENGTH = 64;

export class InvalidKeyLengthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidKeyLengthError';
  }
}

export class InvalidSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSignatureError';
  }
}

export interface Ed25519KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export class ED25519KeyManager {
  randomPrivateKey(): Uint8Array {
    return ed.utils.randomPrivateKey();
  }

  getPublicKeyFromPrivate(privateKey: Uint8Array): Uint8Array {
    if (privateKey.length !== ED25519_PRIVATE_KEY_LENGTH) {
      throw new InvalidKeyLengthError(
        `Invalid private key length. Expected ${ED25519_PRIVATE_KEY_LENGTH} bytes, got ${privateKey.length}.`
      );
    }
    return ed.getPublicKey(privateKey);
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
    return ed.sign(message, privateKey);
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
    return ed.verify(signature, message, publicKey);
  }
}
