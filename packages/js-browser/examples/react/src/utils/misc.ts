import type { KeyPair, PublicKey } from '@polycentric/js-core';
import { Base64 } from 'js-base64';

/**
 * Checks whether two Uint8Arrays have the same contents
 */
const Uint8ArraysAreEqual = (arr1: Uint8Array, arr2: Uint8Array) => {
  if (arr1.length !== arr2.length) return false;
  return arr1.every((val, index) => arr2[index] === val);
};

/**
 * Checks whether two KeyPair objects represent the same key pair
 */
export const keyPairsAreEqual = (k1: KeyPair, k2: KeyPair): boolean => {
  if (k1.keyType !== k2.keyType) return false;
  if (!Uint8ArraysAreEqual(k1.privateKey.key, k2.privateKey.key)) return false;
  if (!Uint8ArraysAreEqual(k1.publicKey.key, k2.publicKey.key)) return false;
  return true;
};

/**
 * Checks whether two PublicKey objects represent the same key
 */
export const publicKeysAreEqual = (k1: PublicKey, k2: PublicKey): boolean => {
  if (k1.keyType !== k2.keyType) return false;
  if (!Uint8ArraysAreEqual(k1.key, k2.key)) return false;
  return true;
};

/**
 * Encodes a byte array using Base64-url
 */
export const encodeBase64 = (data: Uint8Array): string => {
  return Base64.fromUint8Array(data, true);
};

/**
 * Decodes a byte array from Base64
 */
export const decodeBase64 = (data: string): Uint8Array => {
  return Base64.toUint8Array(data);
};
