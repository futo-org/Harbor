import {
  AbstractKeyPairManager,
  bytesToHex,
  hexToBytes,
  v2,
  type PolycentricClient,
  type UnlockedKey,
} from '@polycentric/js-core';
import * as SecureStore from 'expo-secure-store';

const SECURE_STORE_PREFIX = 'polycentric.secure-keys.';

/**
 * Manage keypairs in native secure storage.
 * Private keys can be stored as plaintext or in expo-secure-store.
 * Protected keys are gated by iOS Keychain / Android Keystore auth.
 */
export class ReactNativeKeyPairManager extends AbstractKeyPairManager {
  constructor(client: PolycentricClient) {
    super(client);
  }

  async isProtectedAvailable(): Promise<boolean> {
    return SecureStore.isAvailableAsync();
  }

  /**
   * Generate a new key pair.
   * Store it as plaintext if `protected` is false,
   * otherwise store the private key in expo-secure-store.
   */
  async generate(
    keyType: v2.KeyType,
    opts?: { protected?: boolean; ephemeral?: boolean },
  ): Promise<UnlockedKey> {
    const { privateKey, publicKey } =
      await this.client.cryptoManager.generateKeyPair(keyType);

    if (!opts?.protected) {
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

    if (!(await this.isProtectedAvailable())) {
      throw new Error(
        'ReactNativeKeyPairManager: expo-secure-store unavailable on this device',
      );
    }

    // Ephemeral writes use a fixed slot so a missed post-demo delete leaves
    // at most one orphan instead of accumulating per-pubkey orphans.
    const slot = opts?.ephemeral
      ? 'polycentric.secure-keys.__ephemeral_demo__'
      : slotFor(publicKey);
    await SecureStore.setItemAsync(slot, bytesToHex(privateKey), {
      requireAuthentication: true, // User verification prompt
    });

    const persistedKey = {
      public_key: publicKey,
      key_type: keyType,
    };
    if (!opts?.ephemeral) {
      await this.client.storage.keys.insert(persistedKey);
    } else {
      // It's ephemeral, so delete the SecureStore slot we just wrote.
      await SecureStore.deleteItemAsync(slot).catch(() => {});
    }
    return { persistedKey, unlockedPrivateKey: privateKey };
  }

  /**
   * Polycentric protocol signature.
   * The public key is a rotation key or signing key of a polycentric identity.
   * If the public key argument is not provided, try using the "active public key".
   */
  async sign(bytes: Uint8Array, publicKey?: v2.PublicKey): Promise<Uint8Array> {
    const signer = publicKey ?? this.activePublicKey;
    if (!signer) {
      throw new Error('ReactNativeKeyPairManager.sign: no active key pair');
    }
    const row = await this.client.storage.keys.get(signer);
    if (!row) {
      throw new Error('Unknown public key in ReactNativeKeyPairManager.sign');
    }

    if (row.private_key) {
      return this.client.cryptoManager.sign(
        row.private_key,
        bytes,
        row.key_type,
      );
    }

    // We need to get the key from expo secure store.
    const slot = slotFor(signer.key);
    const stored = await SecureStore.getItemAsync(slot, {
      requireAuthentication: true, // User verification prompt
    });
    if (!stored) {
      throw new Error(`SecureStore slot missing for ${slot}`);
    }
    const privateKey = hexToBytes(stored);
    return this.client.cryptoManager.sign(privateKey, bytes, row.key_type);
  }

  async delete(publicKey: v2.PublicKey): Promise<void> {
    const row = await this.client.storage.keys.get(publicKey);
    if (row && !row.private_key) {
      await SecureStore.deleteItemAsync(slotFor(publicKey.key));
    }
    await this.client.storage.keys.delete(publicKey);
  }
}

function slotFor(publicKey: Uint8Array): string {
  return SECURE_STORE_PREFIX + bytesToHex(publicKey);
}
