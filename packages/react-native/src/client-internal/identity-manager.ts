import { KEY_TYPE } from '../crypto/crypto-manager';
import type { PolycentricClient, KeyPair } from '../polycentric-client';
import { polycentric } from '../generated/protocol';

export class IdentityManager {
  constructor(private readonly client: PolycentricClient) {}

  private async _constructIdentity(keyType: number): Promise<KeyPair> {
    const { privateKey: privateKeyRaw, publicKey: publicKeyRaw } =
      await this.client.cryptoManager.generateKeyPair(keyType);

    const privateKey = polycentric.PrivateKey.create({
      keyType: keyType,
      key: privateKeyRaw,
    });
    const publicKey = polycentric.PublicKey.create({
      keyType: keyType,
      key: publicKeyRaw,
    });

    return { privateKey, publicKey, keyType };
  }

  async createIdentity(): Promise<KeyPair> {
    const { privateKey, publicKey } = await this._constructIdentity(
      KEY_TYPE.ED25519
    );

    // Generate a fresh process ID for this identity
    const processBytes = await this.client.cryptoManager.generateProcessId();
    const processId = polycentric.Process.create({ process: processBytes });

    const keyPair: KeyPair = {
      keyType: Number(privateKey.keyType),
      privateKey: privateKey,
      publicKey: publicKey,
      processId,
    };

    // Persist keys + per-identity process ID to local database
    if (this.client.storage) {
      this.client.storage.identities.store({
        privateKey,
        publicKey,
        processId,
      });
    }

    // Set key pair + process without emitting — caller is responsible
    // for emitting identityChanged after full setup (e.g. adding servers).
    this.client.setCurrentKeyPair(keyPair);
    this.client.setCurrentProcess(processId);

    // Persist which identity is active
    if (this.client.storage) {
      this.client.storage.currentIdentity.set(keyPair.publicKey);
    }

    return keyPair;
  }

  async switchIdentity(publicKey: polycentric.IPublicKey): Promise<KeyPair> {
    if (!this.client.storage) {
      throw new Error('Storage not available');
    }

    const keyPair = this.client.storage.identities.getByPublicKey(publicKey);
    if (!keyPair) {
      throw new Error('Identity not found');
    }

    if (!keyPair.processId) {
      throw new Error('Identity has no process ID');
    }

    this.setCurrentIdentity(keyPair, keyPair.processId);

    // Restore logical clock for this identity
    const processBytes = keyPair.processId.process ?? new Uint8Array();
    const currentClock =
      this.client.storage.processStates.getCurrentLogicalClock(
        keyPair.keyType,
        keyPair.publicKey.key,
        processBytes
      );
    this.client.setLogicalClock(currentClock > 0 ? currentClock + 1 : 1);

    return keyPair;
  }

  getAllIdentities(): KeyPair[] {
    if (!this.client.storage) {
      return [];
    }
    return this.client.storage.identities.getAll();
  }

  setCurrentIdentity(keyPair: KeyPair, process?: polycentric.IProcess): void {
    this.client.setCurrentKeyPair(keyPair);
    if (process) {
      this.client.setCurrentProcess(process);
    }

    // Persist which identity is active
    if (this.client.storage) {
      this.client.storage.currentIdentity.set(keyPair.publicKey);
    }

    this.client.events.emitIdentityChanged({
      keyPair,
      process: process ?? this.client.process,
    });
  }
}
