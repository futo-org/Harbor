import { describe, expect, it } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519.js';
import { CryptoManager } from './crypto-manager';
import { KEY_TYPE } from '../constants';
import { InvalidKeyLengthError, InvalidSignatureError } from '../errors';

const ED25519 = KEY_TYPE.ED25519;
const UNSUPPORTED = KEY_TYPE.SHA256;

/** A deterministic ed25519 private key. */
const privateKeyOf = (seed: number) => new Uint8Array(32).fill(seed);

const message = new TextEncoder().encode('hello polycentric');

describe('CryptoManager', () => {
  const crypto = new CryptoManager();

  describe('generateKeyPair', () => {
    it('returns a 32 byte private key and its matching public key', async () => {
      const { privateKey, publicKey } = await crypto.generateKeyPair(ED25519);

      expect(privateKey).toHaveLength(32);
      expect(publicKey).toHaveLength(32);
      expect(await crypto.derivePublicKey(privateKey, ED25519)).toEqual(
        publicKey,
      );
    });

    it('returns a different key pair on each call', async () => {
      const first = await crypto.generateKeyPair(ED25519);
      const second = await crypto.generateKeyPair(ED25519);

      expect(first.privateKey).not.toEqual(second.privateKey);
      expect(first.publicKey).not.toEqual(second.publicKey);
    });
  });

  describe('derivePublicKey', () => {
    it('derives the ed25519 public key deterministically', async () => {
      const privateKey = privateKeyOf(1);

      const first = await crypto.derivePublicKey(privateKey, ED25519);
      const second = await crypto.derivePublicKey(privateKey, ED25519);

      expect(first).toEqual(ed25519.getPublicKey(privateKey));
      expect(second).toEqual(first);
    });

    it('rejects a private key of the wrong length', async () => {
      await expect(
        crypto.derivePublicKey(new Uint8Array(31), ED25519),
      ).rejects.toBeInstanceOf(InvalidKeyLengthError);
    });
  });

  describe('sign and verify', () => {
    const privateKey = privateKeyOf(1);
    const publicKey = ed25519.getPublicKey(privateKey);

    it('verifies a signature over the signed message', async () => {
      const signature = await crypto.sign(privateKey, message, ED25519);

      expect(signature).toHaveLength(64);
      expect(await crypto.verify(publicKey, message, signature, ED25519)).toBe(
        true,
      );
    });

    it('rejects a signature over a different message', async () => {
      const signature = await crypto.sign(privateKey, message, ED25519);
      const other = new TextEncoder().encode('goodbye polycentric');

      expect(await crypto.verify(publicKey, other, signature, ED25519)).toBe(
        false,
      );
    });

    it('rejects a signature checked against a different public key', async () => {
      const signature = await crypto.sign(privateKey, message, ED25519);
      const otherPublicKey = ed25519.getPublicKey(privateKeyOf(2));

      expect(
        await crypto.verify(otherPublicKey, message, signature, ED25519),
      ).toBe(false);
    });

    it.each([
      ['empty', new Uint8Array()],
      ['binary', new Uint8Array([0, 1, 2, 255, 254, 253])],
    ])('signs and verifies an %s message', async (_, data) => {
      const signature = await crypto.sign(privateKey, data, ED25519);

      expect(await crypto.verify(publicKey, data, signature, ED25519)).toBe(
        true,
      );
    });

    it('rejects signing with a private key of the wrong length', async () => {
      await expect(
        crypto.sign(new Uint8Array(31), message, ED25519),
      ).rejects.toBeInstanceOf(InvalidKeyLengthError);
    });

    it('rejects a signature of the wrong length', async () => {
      await expect(
        crypto.verify(publicKey, message, new Uint8Array(63), ED25519),
      ).rejects.toBeInstanceOf(InvalidSignatureError);
    });

    it('rejects verifying with a public key of the wrong length', async () => {
      const signature = await crypto.sign(privateKey, message, ED25519);

      await expect(
        crypto.verify(new Uint8Array(31), message, signature, ED25519),
      ).rejects.toBeInstanceOf(InvalidKeyLengthError);
    });
  });

  it('supports only ed25519', () => {
    expect(crypto.getSupportedKeyTypes()).toEqual([ED25519]);
  });

  describe('unsupported key types', () => {
    const privateKey = privateKeyOf(1);
    const publicKey = ed25519.getPublicKey(privateKey);

    it.each([
      ['generateKeyPair', () => crypto.generateKeyPair(UNSUPPORTED)],
      [
        'derivePublicKey',
        () => crypto.derivePublicKey(privateKey, UNSUPPORTED),
      ],
      ['sign', () => crypto.sign(privateKey, message, UNSUPPORTED)],
      [
        'verify',
        () =>
          crypto.verify(publicKey, message, new Uint8Array(64), UNSUPPORTED),
      ],
    ])('%s rejects them', async (_, call) => {
      await expect(call()).rejects.toThrow(
        `Unsupported key type: ${UNSUPPORTED}`,
      );
    });
  });
});
