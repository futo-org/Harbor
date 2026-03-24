import type {
  PolycentricClient,
  KeyPair,
  Identity,
  IdentityOptions,
} from '../polycentric-client';
import { KEY_TYPE } from '../constants';
import { PrivateKey, PublicKey } from '../proto/polycentric';

export class IdentityManager {
  constructor(private readonly client: PolycentricClient) {}

  private async _constructIdentity(keyType: bigint): Promise<KeyPair> {
    const { privateKey: privateKeyRaw, publicKey: publicKeyRaw } =
      await this.client.crypto.generateKeyPair(keyType);

    const privateKey = PrivateKey.create({
      keyType: keyType,
      key: privateKeyRaw,
    });
    const publicKey = PublicKey.create({
      keyType: keyType,
      key: publicKeyRaw,
    });

    return { privateKey, publicKey, keyType };
  }

  async createIdentity(options: IdentityOptions): Promise<KeyPair> {
    const { privateKey, publicKey } = await this._constructIdentity(
      options.keyType ?? KEY_TYPE.ED25519,
    );

    if (!options.ephemeral) {
      await this.client.storage.keys.storeKeys({
        privateKey,
        publicKey,
      });
    }

    const identity: KeyPair = {
      keyType: privateKey.keyType,
      privateKey: privateKey,
      publicKey: publicKey,
    };

    // If setAsCurrent is not explicity set to false. That is, setAsCurrent should default to true
    if (!(options.setAsCurrent === false)) {
      this.setCurrentIdentity(identity, options.ephemeral);
    }

    return identity;
  }

  async importIdentity(
    privateKey: PrivateKey,
    setAsCurrent: boolean = true,
  ): Promise<KeyPair> {
    const keyType = privateKey.keyType;

    const publicKey = {
      keyType: keyType,
      key: await this.client.crypto.derivePublicKey(
        privateKey.key,
        BigInt(privateKey.keyType),
      ),
    };

    await this.client.storage.keys.storeKeys({
      privateKey,
      publicKey,
    });

    if (setAsCurrent) {
      this.setCurrentIdentity({ keyType, privateKey, publicKey });
    }

    return {
      keyType,
      publicKey,
      privateKey,
    };
  }

  async getAllIdentities(): Promise<KeyPair[]> {
    const keys = await this.client.storage.keys.getAllKeys();

    return keys.map((key) => ({
      keyType: key.privateKey.keyType,
      privateKey: key.privateKey,
      publicKey: key.publicKey,
    }));
  }

  async removeIdentity(publicKey: PublicKey) {
    await this.client.storage.keys.removeKeys(publicKey);
  }

  async switchIdentity(publicKey: PublicKey): Promise<KeyPair> {
    const keys =
      await this.client.storage.keys.retrieveKeysByPublicKey(publicKey);
    if (!keys) {
      throw new Error(`Identity with public key not found`);
    }

    this.setCurrentIdentity({
      keyType: keys.privateKey.keyType,
      privateKey: keys.privateKey,
      publicKey: keys.publicKey,
    });

    return this.client.currentKeyPair;
  }

  private setCurrentIdentity(keys: KeyPair, ephemeral?: boolean): void {
    this.client.setCurrentKeyPair(keys, ephemeral);

    if (this.client.process) {
      const identity: Identity = {
        keyPair: this.client.currentKeyPair,
        process: this.client.process,
      };
      this.client.events.emitIdentityChanged(identity);
    }
  }
}
