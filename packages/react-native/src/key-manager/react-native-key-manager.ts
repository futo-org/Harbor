import {
  bytesToHex,
  hexToBytes,
  publicKeyToString,
  v2,
  type IKeyPairManager,
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
export class ReactNativeKeyPairManager implements IKeyPairManager {
  constructor(private readonly client: PolycentricClient) {}

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
    opts?: { protected?: boolean; strict?: boolean },
  ): Promise<UnlockedKey> {
    const { privateKey, publicKey } =
      await this.client.cryptoManager.generateKeyPair(keyType);

    if (opts?.protected) {
      // Try protected storage.
      if (!(await this.isProtectedAvailable())) {
        if (opts.strict) {
          throw new Error(
            'ReactNativeKeyPairManager: expo-secure-store unavailable on this device',
          );
        }
      } else {
        try {
          await SecureStore.setItemAsync(
            getSecureStoreKey(v2.PublicKey.create({ keyType, key: publicKey })),
            bytesToHex(privateKey),
            {
              requireAuthentication: true, // User verification prompt
            },
          );
          const persistedKey = {
            public_key: publicKey,
            key_type: keyType,
          };
          await this.client.storage.keys.insert(persistedKey);
          return {
            persistedKey,
            isProtected: true,
            unlockedPrivateKey: privateKey,
          };
        } catch (err) {
          if (opts.strict) throw err;
        }
      }
    }

    // Use unprotected storage.
    const persistedKey = {
      public_key: publicKey,
      key_type: keyType,
      private_key: privateKey,
    };
    await this.client.storage.keys.insert(persistedKey);
    return {
      persistedKey,
      isProtected: false,
      unlockedPrivateKey: privateKey,
    };
  }

  /**
   * Polycentric protocol signature.
   * The public key is a rotation key or signing key of a polycentric identity.
   */
  async sign(bytes: Uint8Array, signer: v2.PublicKey): Promise<Uint8Array> {
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
    const slot = getSecureStoreKey(signer);
    const stored = await SecureStore.getItemAsync(slot, {
      requireAuthentication: true, // User verification prompt
    });
    if (!stored) {
      throw new Error(`SecureStore slot missing for ${slot}`);
    }
    const privateKey = hexToBytes(stored);
    return this.client.cryptoManager.sign(privateKey, bytes, row.key_type);
  }

  /**
   * Move a locally-held key into expo-secure-store (`protect=true`) or back to
   * a plaintext row (`protect=false`). Both directions prompt for user
   * verification.
   */
  async setProtected(publicKey: v2.PublicKey, protect: boolean): Promise<void> {
    const row = await this.client.storage.keys.get(publicKey);
    if (!row) {
      throw new Error(
        'Unknown public key in ReactNativeKeyPairManager.setProtected',
      );
    }
    const slot = getSecureStoreKey(publicKey);

    if (protect) {
      if (!row.private_key) return; // already in secure store
      if (!(await this.isProtectedAvailable())) {
        throw new Error('expo-secure-store unavailable on this device');
      }
      await SecureStore.setItemAsync(slot, bytesToHex(row.private_key), {
        requireAuthentication: true, // User verification prompt
      });
      // Re-persist without the plaintext private key.
      await this.client.storage.keys.insert({
        public_key: row.public_key,
        key_type: row.key_type,
      });
      return;
    }

    if (row.private_key) return; // already plaintext
    const stored = await SecureStore.getItemAsync(slot, {
      requireAuthentication: true, // User verification prompt
    });
    if (!stored) {
      throw new Error(`SecureStore slot missing for ${slot}`);
    }
    await this.client.storage.keys.insert({
      public_key: row.public_key,
      key_type: row.key_type,
      private_key: hexToBytes(stored),
    });
    await SecureStore.deleteItemAsync(slot).catch(() => {});
  }

  async unlock(publicKey: v2.PublicKey): Promise<UnlockedKey | null> {
    const row = await this.client.storage.keys.get(publicKey);
    if (!row) return null;
    if (row.private_key) {
      return {
        persistedKey: row,
        isProtected: false,
        unlockedPrivateKey: row.private_key,
      };
    }
    const slot = getSecureStoreKey(publicKey);
    const stored = await SecureStore.getItemAsync(slot, {
      requireAuthentication: true, // User verification prompt
    });
    if (!stored) {
      throw new Error(`SecureStore slot missing for ${slot}`);
    }
    return {
      persistedKey: row,
      isProtected: true,
      unlockedPrivateKey: hexToBytes(stored),
    };
  }

  async delete(publicKey: v2.PublicKey): Promise<void> {
    const row = await this.client.storage.keys.get(publicKey);
    if (row && !row.private_key) {
      await SecureStore.deleteItemAsync(getSecureStoreKey(publicKey));
    }
    await this.client.storage.keys.delete(publicKey);
  }
}

function getSecureStoreKey(publicKey: v2.PublicKey): string {
  return SECURE_STORE_PREFIX + publicKeyToString(publicKey);
}
