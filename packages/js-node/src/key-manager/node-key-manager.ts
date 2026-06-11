import {
  v2,
  type IKeyPairManager,
  type PolycentricClient,
  type UnlockedKey,
} from '@polycentric/js-core';

/**
 * Node-side owner of key pair operations. No hardware-backed keystore
 * is available, so `generate({ protected: true })` throws.
 */
export class NodeKeyPairManager implements IKeyPairManager {
  constructor(private readonly client: PolycentricClient) {}

  /**
   * This is for more secure key storage on web and React Native.
   * It's not implemented on node.
   */
  async isProtectedAvailable(): Promise<boolean> {
    return false;
  }

  async generate(
    keyType: v2.KeyType,
    opts?: { protected?: boolean; strict?: boolean },
  ): Promise<UnlockedKey> {
    if (opts?.protected && opts.strict) {
      throw new Error(
        'NodeKeyPairManager: hardware-backed key storage is not available on node',
      );
    }
    const { privateKey, publicKey } =
      await this.client.cryptoManager.generateKeyPair(keyType);
    const persistedKey = {
      public_key: publicKey,
      key_type: keyType,
      private_key: privateKey,
    };
    await this.client.storage.keys.insert(persistedKey);
    return { persistedKey, isProtected: false, unlockedPrivateKey: privateKey };
  }

  async sign(bytes: Uint8Array, signer: v2.PublicKey): Promise<Uint8Array> {
    const row = await this.client.storage.keys.get(signer);
    if (!row || !row.private_key) {
      throw new Error('Unknown public key in NodeKeyPairManager.sign');
    }
    return this.client.cryptoManager.sign(row.private_key, bytes, row.key_type);
  }

  async setProtected(
    _publicKey: v2.PublicKey,
    protect: boolean,
  ): Promise<void> {
    if (protect) {
      throw new Error(
        'NodeKeyPairManager: protected key storage is not available on node',
      );
    }
    // Node keys are always plaintext; moving out of secure storage is a no-op.
  }

  async unlock(publicKey: v2.PublicKey): Promise<UnlockedKey | null> {
    const row = await this.client.storage.keys.get(publicKey);
    if (!row) return null;
    return {
      persistedKey: row,
      isProtected: false,
      unlockedPrivateKey: row.private_key,
    };
  }

  async delete(publicKey: v2.PublicKey): Promise<void> {
    await this.client.storage.keys.delete(publicKey);
  }
}
