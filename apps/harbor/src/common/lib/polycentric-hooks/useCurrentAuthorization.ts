import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import {
  IdentityManager,
  type PolycentricClient,
} from '@polycentric/react-native';
import { useMemo, useState } from 'react';

export interface CurrentAuthorization {
  /** Whether the current session is authorized to rotate in the identity chain. */
  canRotate: boolean;

  /** Whether the current session is authorized to sign new events. */
  canSign: boolean;
}

export interface CurrentAuthorizationHookResult extends CurrentAuthorization {
  /** Refresh from the current local state */
  refresh: () => void;
}

function findAuthorization(client: PolycentricClient): CurrentAuthorization {
  const myIdentity = client.activeIdentityKey;
  const myKey = client.currentKeyPair?.publicKey;
  if (!myIdentity || !myKey) return { canRotate: false, canSign: false };

  const identityState = client.identityManager.resolveIdentity();
  if (!identityState) return { canRotate: false, canSign: false };

  const canRotate = identityState.rotationKeys.some((k) =>
    IdentityManager.keysEqual(k, myKey),
  );

  const canSign =
    canRotate ||
    identityState.signingKeys.some((k) => IdentityManager.keysEqual(k, myKey));

  return { canRotate, canSign };
}

export function useCurrentAuthorization(): CurrentAuthorizationHookResult {
  const client = usePolycentric();

  // TODO: this should be reactive instead of having a `refresh()` function.
  // However, `resolveIdentity()` goes through rs-core to get the
  // latest identity state.
  // It's not clear what the dependency list should be for it to refresh properly.
  const [authorization, setAuthorization] = useState(() =>
    findAuthorization(client),
  );

  return useMemo(() => {
    return {
      ...authorization,
      refresh: () => {
        setAuthorization(findAuthorization(client));
      },
    };
  }, [client, authorization]);
}
