import { useEffect, useState } from 'react';
import { verifierApi } from '../utils/verifier-api';

/**
 * The Polycentric identities of the configured verifier bots, or undefined
 * while they load (or when no server is reachable).
 */
export function useVerifierIdentities(): Set<string> | undefined {
  const [identities, setIdentities] = useState<Set<string>>();

  useEffect(() => {
    let cancelled = false;
    verifierApi
      .verifierIdentities()
      .then((set) => {
        if (!cancelled) setIdentities(set);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return identities;
}
