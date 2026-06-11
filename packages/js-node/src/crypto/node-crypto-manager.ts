import { ed25519 } from '@noble/curves/ed25519.js';
import type { ICryptoManager } from '@polycentric/js-core';
import { KEY_TYPE } from '@polycentric/js-core';

// TODO this is functionally identical to BrowserCryptoManager and
// ReactNativeCryptoManager. Move to js-core as a single CryptoManager;
export class NodeCryptoManager implements ICryptoManager {
  async generateKeyPair(keyType: number) {
    this.assertEd25519(keyType);
    const privateKey = ed25519.utils.randomSecretKey();
    const publicKey = ed25519.getPublicKey(privateKey);
    return { privateKey, publicKey };
  }

  async derivePublicKey(privateKey: Uint8Array, keyType: number) {
    this.assertEd25519(keyType);
    return ed25519.getPublicKey(privateKey);
  }

  async sign(privateKey: Uint8Array, message: Uint8Array, keyType: number) {
    this.assertEd25519(keyType);
    return ed25519.sign(message, privateKey);
  }

  async verify(
    publicKey: Uint8Array,
    message: Uint8Array,
    signature: Uint8Array,
    keyType: number,
  ) {
    this.assertEd25519(keyType);
    return ed25519.verify(signature, message, publicKey);
  }

  async generateProcessId() {
    return ed25519.utils.randomSecretKey().slice(0, 16);
  }

  getSupportedKeyTypes() {
    return [KEY_TYPE.ED25519];
  }

  toHex(data: Uint8Array) {
    return Array.from(data, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  private assertEd25519(keyType: number) {
    if (keyType !== KEY_TYPE.ED25519) {
      throw new Error(`Unsupported key type: ${keyType}`);
    }
  }
}
