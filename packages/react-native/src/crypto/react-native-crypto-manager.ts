import { type ICryptoManager, KEY_TYPE } from '@polycentric/js-core';
import { ED25519KeyManager } from './ed25519-key-manager';

export class ReactNativeCryptoManager implements ICryptoManager {
  private ed25519Manager = new ED25519KeyManager();

  async generateKeyPair(
    keyType: number,
  ): Promise<{ privateKey: Uint8Array; publicKey: Uint8Array }> {
    this._assertKeyType(keyType);
    return this.ed25519Manager.generateKeyPair();
  }

  async derivePublicKey(
    privateKey: Uint8Array,
    keyType: number,
  ): Promise<Uint8Array> {
    this._assertKeyType(keyType);
    return this.ed25519Manager.getPublicKeyFromPrivate(privateKey);
  }

  async sign(
    privateKey: Uint8Array,
    message: Uint8Array,
    keyType: number,
  ): Promise<Uint8Array> {
    this._assertKeyType(keyType);
    return this.ed25519Manager.sign(message, privateKey);
  }

  async verify(
    publicKey: Uint8Array,
    message: Uint8Array,
    signature: Uint8Array,
    keyType: number,
  ): Promise<boolean> {
    this._assertKeyType(keyType);
    return this.ed25519Manager.verify(signature, message, publicKey);
  }

  async generateProcessId(): Promise<Uint8Array> {
    return this.ed25519Manager.randomPrivateKey().slice(0, 16);
  }

  getSupportedKeyTypes(): number[] {
    return [KEY_TYPE.ED25519];
  }

  toHex(data: Uint8Array): string {
    return Array.from(data)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  private _assertKeyType(keyType: number): void {
    if (keyType !== KEY_TYPE.ED25519) {
      throw new Error(`Unsupported key type: ${keyType}`);
    }
  }
}
