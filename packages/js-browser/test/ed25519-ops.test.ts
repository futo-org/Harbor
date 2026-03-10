import { expect, test, describe, beforeEach } from 'vitest';
import { BrowserCryptoManager } from '@polycentric/js-browser';
import {
  InvalidKeyLengthError,
  InvalidSignatureError,
  KEY_TYPE,
} from '@polycentric/js-core';

describe('BrowserCryptoManager', () => {
  let cryptoManager: BrowserCryptoManager;

  beforeEach(() => {
    cryptoManager = new BrowserCryptoManager();
  });

  describe('Key Generation', () => {
    test('should generate a complete key pair', async () => {
      const keyPair = await cryptoManager.generateKeyPair(KEY_TYPE.ED25519);

      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.privateKey.length).toBe(32);
      expect(keyPair.publicKey.length).toBe(32);
    });

    test('should generate different key pairs on each call', async () => {
      const keyPair1 = await cryptoManager.generateKeyPair(KEY_TYPE.ED25519);
      const keyPair2 = await cryptoManager.generateKeyPair(KEY_TYPE.ED25519);

      expect(keyPair1.privateKey).not.toEqual(keyPair2.privateKey);
      expect(keyPair1.publicKey).not.toEqual(keyPair2.publicKey);
    });
  });

  describe('Public Key Derivation', () => {
    test('should derive public key from private key', async () => {
      const keyPair = await cryptoManager.generateKeyPair(KEY_TYPE.ED25519);
      const derivedPublicKey = await cryptoManager.derivePublicKey(
        keyPair.privateKey,
        KEY_TYPE.ED25519,
      );

      expect(derivedPublicKey).toBeInstanceOf(Uint8Array);
      expect(derivedPublicKey.length).toBe(32);
      expect(derivedPublicKey).toEqual(keyPair.publicKey);
    });

    test('should derive the same public key from the same private key', async () => {
      const keyPair = await cryptoManager.generateKeyPair(KEY_TYPE.ED25519);
      const publicKey1 = await cryptoManager.derivePublicKey(
        keyPair.privateKey,
        KEY_TYPE.ED25519,
      );
      const publicKey2 = await cryptoManager.derivePublicKey(
        keyPair.privateKey,
        KEY_TYPE.ED25519,
      );

      expect(publicKey1).toEqual(publicKey2);
    });

    test('should throw InvalidKeyLengthError for invalid private key length', async () => {
      const invalidPrivateKey = new Uint8Array(16);

      await expect(async () => {
        await cryptoManager.derivePublicKey(
          invalidPrivateKey,
          KEY_TYPE.ED25519,
        );
      }).rejects.toThrow(InvalidKeyLengthError);
    });
  });

  describe('Digital Signatures', () => {
    let keyPair: { privateKey: Uint8Array; publicKey: Uint8Array };
    let message: Uint8Array;

    beforeEach(async () => {
      keyPair = await cryptoManager.generateKeyPair(KEY_TYPE.ED25519);
      message = new TextEncoder().encode('Hello, world!');
    });

    test('should sign and verify a message', async () => {
      const signature = await cryptoManager.sign(
        keyPair.privateKey,
        message,
        KEY_TYPE.ED25519,
      );

      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBe(64);

      const isValid = await cryptoManager.verify(
        keyPair.publicKey,
        message,
        signature,
        KEY_TYPE.ED25519,
      );
      expect(isValid).toBe(true);
    });

    test('should reject signature with wrong message', async () => {
      const signature = await cryptoManager.sign(
        keyPair.privateKey,
        message,
        KEY_TYPE.ED25519,
      );
      const wrongMessage = new TextEncoder().encode('Wrong message');

      const isValid = await cryptoManager.verify(
        keyPair.publicKey,
        wrongMessage,
        signature,
        KEY_TYPE.ED25519,
      );
      expect(isValid).toBe(false);
    });

    test('should reject signature with wrong public key', async () => {
      const signature = await cryptoManager.sign(
        keyPair.privateKey,
        message,
        KEY_TYPE.ED25519,
      );
      const wrongKeyPair = await cryptoManager.generateKeyPair(
        KEY_TYPE.ED25519,
      );

      const isValid = await cryptoManager.verify(
        wrongKeyPair.publicKey,
        message,
        signature,
        KEY_TYPE.ED25519,
      );
      expect(isValid).toBe(false);
    });

    test('should throw InvalidKeyLengthError for invalid private key length', async () => {
      const invalidPrivateKey = new Uint8Array(16);

      await expect(async () => {
        await cryptoManager.sign(invalidPrivateKey, message, KEY_TYPE.ED25519);
      }).rejects.toThrow(InvalidKeyLengthError);
    });

    test('should throw InvalidSignatureError for invalid signature length', async () => {
      const invalidSignature = new Uint8Array(32);

      await expect(async () => {
        await cryptoManager.verify(
          keyPair.publicKey,
          message,
          invalidSignature,
          KEY_TYPE.ED25519,
        );
      }).rejects.toThrow(InvalidSignatureError);
    });
  });

  describe('Process ID Generation', () => {
    test('should generate a process ID of correct length', async () => {
      const processId = await cryptoManager.generateProcessId();

      expect(processId).toBeInstanceOf(Uint8Array);
      expect(processId.length).toBe(16);
    });

    test('should generate different process IDs on each call', async () => {
      const processId1 = await cryptoManager.generateProcessId();
      const processId2 = await cryptoManager.generateProcessId();

      expect(processId1).not.toEqual(processId2);
    });
  });

  describe('Supported Key Types', () => {
    test('should return supported key types', () => {
      const supportedTypes = cryptoManager.getSupportedKeyTypes();

      expect(supportedTypes).toBeInstanceOf(Array);
      expect(supportedTypes).toContain(KEY_TYPE.ED25519);
    });
  });

  describe('Hex Conversion', () => {
    test('should convert Uint8Array to hex string', () => {
      const data = new Uint8Array([0, 1, 15, 16, 255]);
      const hex = cryptoManager.toHex(data);

      expect(hex).toBe('00010f10ff');
    });

    test('should handle empty array', () => {
      const data = new Uint8Array([]);
      const hex = cryptoManager.toHex(data);

      expect(hex).toBe('');
    });

    test('should convert key to readable hex format', async () => {
      const keyPair = await cryptoManager.generateKeyPair(KEY_TYPE.ED25519);
      const privateKeyHex = cryptoManager.toHex(keyPair.privateKey);
      const publicKeyHex = cryptoManager.toHex(keyPair.publicKey);

      expect(privateKeyHex).toMatch(/^[0-9a-f]{64}$/); // 32 bytes = 64 hex chars
      expect(publicKeyHex).toMatch(/^[0-9a-f]{64}$/); // 32 bytes = 64 hex chars
      expect(privateKeyHex).not.toBe(publicKeyHex);
    });
  });

  describe('Edge Cases', () => {
    test('should work with binary and empty data', async () => {
      const keyPair = await cryptoManager.generateKeyPair(KEY_TYPE.ED25519);

      const binaryData = new Uint8Array([0, 1, 2, 3, 255, 254, 253]);
      const binarySignature = await cryptoManager.sign(
        keyPair.privateKey,
        binaryData,
        KEY_TYPE.ED25519,
      );
      expect(
        await cryptoManager.verify(
          keyPair.publicKey,
          binaryData,
          binarySignature,
          KEY_TYPE.ED25519,
        ),
      ).toBe(true);

      const emptyData = new Uint8Array(0);
      const emptySignature = await cryptoManager.sign(
        keyPair.privateKey,
        emptyData,
        KEY_TYPE.ED25519,
      );
      expect(
        await cryptoManager.verify(
          keyPair.publicKey,
          emptyData,
          emptySignature,
          KEY_TYPE.ED25519,
        ),
      ).toBe(true);
    });
  });
});
