import type { IdentityState, v2 } from '@polycentric/react-native';
import { useMemo } from 'react';
import { usePolycentricContext } from './context';
import { keysEqual } from './helpers';

export interface CurrentAuthorization {
  /** Whether the current session is authorized to rotate in the identity chain. */
  canRotate: boolean;

  /** Whether the current session is authorized to sign new events. */
  canSign: boolean;
}

export interface CurrentAuthorizationHookResult extends CurrentAuthorization {
  /** Re-read the identity's state from rs-core. */
  refresh: () => void;
}

export function findAuthorization(
  identityState: IdentityState | null | undefined,
  myKey: v2.PublicKey | null | undefined,
): CurrentAuthorization {
  if (!identityState || !myKey) return { canRotate: false, canSign: false };

  const canRotate = identityState.rotationKeys.some((k) => keysEqual(k, myKey));
  const canSign =
    canRotate || identityState.signingKeys.some((k) => keysEqual(k, myKey));

  return { canRotate, canSign };
}

/** What the signed-in key may do, per the identity's latest known state. */
export function useCurrentAuthorization(): CurrentAuthorizationHookResult {
  const { client, currentIdentity, refreshCurrentIdentity } =
    usePolycentricContext();
  const myKey = client.activePublicKey;

  return useMemo(
    () => ({
      ...findAuthorization(currentIdentity, myKey),
      refresh: () => void refreshCurrentIdentity(),
    }),
    [currentIdentity, myKey, refreshCurrentIdentity],
  );
}
