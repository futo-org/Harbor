import {
  AbstractKeyPairManager,
  v2,
  type PolycentricClient,
  type UnlockedKey,
} from '@polycentric/js-core';

/**
 * Node-side owner of key pair operations. No hardware-backed keystore
 * is available, so `generate({ protected: true })` throws.
 */
export class NodeKeyPairManager extends AbstractKeyPairManager {
  constructor(client: PolycentricClient) {
    super(client);
  }

  /**
   * This is for more secure key storage on web and React Native.
   * It's not implemented on node.
   */
  async isProtectedAvailable(): Promise<boolean> {
    return false;
  }

  async generate(
    keyType: v2.KeyType,
    opts?: { protected?: boolean; ephemeral?: boolean },
  ): Promise<UnlockedKey> {
    if (opts?.protected) {
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
    if (!opts?.ephemeral) {
      await this.client.storage.keys.insert(persistedKey);
    }
    return { persistedKey, unlockedPrivateKey: privateKey };
  }

  async sign(bytes: Uint8Array, publicKey?: v2.PublicKey): Promise<Uint8Array> {
    const signer = publicKey ?? this.activePublicKey;
    if (!signer) {
      throw new Error('NodeKeyPairManager.sign: no active key pair');
    }
    const row = await this.client.storage.keys.get(signer);
    if (!row || !row.private_key) {
      throw new Error('Unknown public key in NodeKeyPairManager.sign');
    }
    return this.client.cryptoManager.sign(row.private_key, bytes, row.key_type);
  }

  async delete(publicKey: v2.PublicKey): Promise<void> {
    await this.client.storage.keys.delete(publicKey);
  }
}
