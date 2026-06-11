import { bytesToHex, usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { type PersistedKey, v2 } from '@polycentric/react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

export type KeyRole = 'rotation' | 'signing';

export interface IdentityKeyPair {
  /** The member's public key. */
  publicKey: v2.PublicKey;
  /** Role on the identity. */
  role: KeyRole;
  /** Whether this client holds the key locally. */
  onDevice: boolean;
  /** Only meaningful when onDevice: private key is in secure storage. */
  protected: boolean;
  /** Passkey user name protecting this key (browser protected keys only). */
  credentialLabel?: string;
}

/**
 * Loads an identity's member keys (rotation/signing) as enriched
 * `IdentityKeyPair`s and reloads on screen focus.
 */
export function useIdentityKeyPairs(identityKey: string | null | undefined) {
  const client = usePolycentric();
  const [keys, setKeys] = useState<IdentityKeyPair[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!identityKey) {
      setKeys([]);
      setLoading(false);
      return;
    }
    const [info, localKeys] = await Promise.all([
      client.identityManager.getIdentityState(identityKey),
      client.storage.keys.getAllKeys(),
    ]);

    const localByHex = new Map<string, PersistedKey>(
      localKeys.map((k) => [bytesToHex(k.public_key), k]),
    );

    const build = (publicKey: v2.PublicKey, role: KeyRole): IdentityKeyPair => {
      const local = localByHex.get(bytesToHex(publicKey.key));
      return {
        publicKey,
        role,
        onDevice: !!local,
        protected: !!local && !local.private_key,
        credentialLabel: local?.credential_label,
      };
    };

    setKeys([
      ...info.rotationKeys.map((k) => build(k, 'rotation')),
      ...info.signingKeys.map((k) => build(k, 'signing')),
    ]);
    setLoading(false);
  }, [client, identityKey]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { keys, loading, reload };
}
