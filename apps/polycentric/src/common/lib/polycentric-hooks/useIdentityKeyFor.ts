import type { KeyPair } from '@polycentric/react-native';
import { useEffect, useState } from 'react';
import { pubkeyStr } from './helpers';
import { usePolycentricContext } from './PolycentricProvider';

// Needed because client.getIdentityKeyFor is now async and can't be called in render.
export function useIdentityKeyFor(keyPair: KeyPair): string | null {
  const { client } = usePolycentricContext();
  const pubKey = pubkeyStr(keyPair.publicKey);
  const [identityKey, setIdentityKey] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void client.getIdentityKeyFor(keyPair).then((k) => {
      if (!cancelled) setIdentityKey(k);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, pubKey]);
  return identityKey;
}
