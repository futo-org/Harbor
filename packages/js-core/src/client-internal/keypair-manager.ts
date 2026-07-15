import type {
  PolycentricClient,
  KeyPair,
  PrivateKey,
} from '../polycentric-client';
import { KEY_TYPE } from '../constants';
import { PublicKey, type KeyType } from '../proto/v2';

export class KeyPairManager {
  constructor(private readonly client: PolycentricClient) {}

  private async generateKeyPair(keyType: KeyType): Promise<KeyPair> {
    const { privateKey: privateKeyRaw, publicKey: publicKeyRaw } =
      await this.client.crypto.generateKeyPair(keyType);

    const privateKey: PrivateKey = {
      keyType,
      key: privateKeyRaw,
    };
    const publicKey = PublicKey.create({
      keyType,
      key: publicKeyRaw,
    });

    return { privateKey, publicKey, keyType };
  }

  /**
   * Creates a new key pair, stores it, and optionally sets it as current.
   */
  async createKeyPair(options: {
    keyType?: KeyType;
    setAsCurrent?: boolean;
  }): Promise<KeyPair> {
    const keyPair = await this.generateKeyPair(
      options.keyType ?? KEY_TYPE.ED25519,
    );

    await this.client.storage.keys.storeKeys({
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
    });

    // setAsCurrent defaults to true
    if (!(options.setAsCurrent === false)) {
      await this.client.setCurrentKeyPair(keyPair);
    }

    return keyPair;
  }

  /**
   * Returns all stored key pairs.
   */
  async getKeys(): Promise<KeyPair[]> {
    const keys = await this.client.storage.keys.getAllKeys();

    return keys.map((key) => ({
      keyType: key.privateKey.keyType,
      privateKey: key.privateKey,
      publicKey: key.publicKey,
    }));
  }

  /**
   * Removes a key pair by its public key.
   */
  async removeKeyPair(publicKey: PublicKey) {
    await this.client.storage.keys.removeKeys(publicKey);
  }

  /**
   * Switches the active key pair to the one matching the given public key.
   */
  async switchKeyPair(publicKey: PublicKey): Promise<KeyPair> {
    const keys =
      await this.client.storage.keys.retrieveKeysByPublicKey(publicKey);
    if (!keys) {
      throw new Error('Key pair not found');
    }

    const keyPair: KeyPair = {
      keyType: keys.privateKey.keyType,
      privateKey: keys.privateKey,
      publicKey: keys.publicKey,
    };

    await this.client.setCurrentKeyPair(keyPair);
    return keyPair;
  }
}
