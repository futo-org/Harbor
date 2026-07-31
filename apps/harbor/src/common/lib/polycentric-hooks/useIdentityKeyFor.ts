import type { KeyPair } from '@polycentric/react-native';
import { useEffect, useState } from 'react';
import { pubkeyStr } from './helpers';
import { usePolycentricContext } from './PolycentricProvider';

// Needed because client.getIdentityKeyFor is now async and can't be called in render.
export function useIdentityKeyFor(keyPair: KeyPair): string | null {
  const { client } = usePolycentricContext();
  const pubKey = pubkeyStr(keyPair.publicKey);
  const [identityKey, setIdentityKey] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `keyPair` is keyed by its stable `pubKey` string
  useEffect(() => {
    let cancelled = false;
    void client.getIdentityKeyFor(keyPair).then((k) => {
      if (!cancelled) setIdentityKey(k);
    });
    return () => {
      cancelled = true;
    };
  }, [client, pubKey]);
  return identityKey;
}
