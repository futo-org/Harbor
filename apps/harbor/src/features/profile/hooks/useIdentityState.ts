import {
  useCurrentIdentity,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { COLLECTION, type IdentityState } from '@polycentric/react-native';
import { useEffect, useState } from 'react';

export interface IdentityStateHookResult {
  state: IdentityState | null;
  isLoading: boolean;
}

export function useIdentityState(
  identityKey: string | null | undefined,
): IdentityStateHookResult {
  const client = usePolycentric();
  const { identity: self } = useCurrentIdentity();

  const [state, setState] = useState<IdentityState | null>(null);
  const [isLoading, setIsLoading] = useState(!!identityKey);

  useEffect(() => {
    if (!identityKey) {
      setState(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    let refreshed = false;
    setState(null);
    setIsLoading(true);
    // Show what's held locally at once, then refresh from the servers.
    void client
      .resolveIdentity(identityKey)
      .then((local) => {
        if (!cancelled && !refreshed && local) setState(local);
      })
      .catch(() => {});
    void client
      .listEvents({ identity: identityKey, collection: COLLECTION.IDENTITY })
      .then(() => client.resolveIdentity(identityKey))
      .then((resolved) => {
        if (cancelled) return;
        refreshed = true;
        setState(resolved);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, identityKey]);

  const resolved =
    self && identityKey && self.identityKey === identityKey ? self : state;

  return { state: resolved, isLoading: isLoading && !resolved };
}
