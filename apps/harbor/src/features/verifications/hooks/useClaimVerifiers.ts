import { hexToBytes } from '@/src/common/lib/polycentric-hooks/helpers';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import { type EventKey, Query, v2 } from '@polycentric/react-native';
import { useMemo } from 'react';
import {
  type ClaimVerificationStatus,
  combineVerifiers,
  decodeVerifierIdentities,
  decodeTargetIdentities,
  statusOf,
} from '../utils/claim-status';
import { PLATFORM_SCHEMA_NAME } from '../utils/platforms';
import { useVerifierIdentities } from './useVerifierIdentities';

export type ClaimVerifiersResult = ClaimVerificationStatus & {
  isLoading: boolean;
  refresh: () => void;
};

// Placeholder while there's no claim id — the query stays disabled but
// `useQuery` still constructs its query source.
const EMPTY_KEY: EventKey = {
  collection: 0,
  identity: '',
  signedBy: { keyType: 0, key: new ArrayBuffer(0) },
  sequence: 0n,
};

/** The query-arg shape of a claim's hex-encoded event key, or null. */
function decodeClaimEventKey(claimId: string | undefined): EventKey | null {
  if (!claimId) return null;
  try {
    const key = v2.EventKey.fromBinary(hexToBytes(claimId));
    if (!key.signedBy || !key.identity) return null;
    return {
      collection: key.collection,
      identity: key.identity,
      signedBy: {
        keyType: key.signedBy.keyType,
        key: new Uint8Array(key.signedBy.key).buffer,
      },
      sequence: key.sequence,
    };
  } catch {
    return null;
  }
}

/**
 * Who has been asked to verify a claim (`VerificationTarget` events) and
 * whether each has verified it (`VerificationVerify` events), keyed by the
 * claim's hex-encoded event key (`DecodedClaim.id`).
 */
export function useClaimVerifiers(
  claimId: string | undefined,
  schemaName?: string,
): ClaimVerifiersResult {
  const claimEventKey = useMemo(() => decodeClaimEventKey(claimId), [claimId]);
  const enabled = !!claimEventKey;
  const verifierBots = useVerifierIdentities();
  const isPlatform = schemaName === PLATFORM_SCHEMA_NAME;

  const targets = useQuery(
    ['verification-targets', claimId ?? ''],
    new Query.ListVerificationTargets({
      claimEventKey: claimEventKey ?? EMPTY_KEY,
    }),
    undefined,
    enabled,
  );
  const verifies = useQuery(
    ['verification-verifies', claimId ?? ''],
    new Query.ListVerificationVerifies({
      claimEventKey: claimEventKey ?? EMPTY_KEY,
    }),
    undefined,
    enabled,
  );

  const requested = useMemo<string[]>(() => {
    if (!enabled || !targets.data || targets.data.byteLength === 0) return [];
    try {
      const response = v2.ListVerificationTargetsResponse.fromBinary(
        new Uint8Array(targets.data),
      );
      return decodeTargetIdentities(response.eventBundles);
    } catch {
      return [];
    }
  }, [enabled, targets.data]);

  const verifiedBy = useMemo<Set<string>>(() => {
    if (!enabled || !verifies.data || verifies.data.byteLength === 0) {
      return new Set();
    }
    try {
      const response = v2.ListVerificationVerifiesResponse.fromBinary(
        new Uint8Array(verifies.data),
      );
      return decodeVerifierIdentities(response.eventBundles);
    } catch {
      return new Set();
    }
  }, [enabled, verifies.data]);

  const status = useMemo(
    () =>
      statusOf(
        combineVerifiers(
          requested,
          verifiedBy,
          isPlatform ? verifierBots : undefined,
        ),
      ),
    [requested, verifiedBy, isPlatform, verifierBots],
  );

  return {
    ...status,
    isLoading: targets.isLoading || verifies.isLoading,
    refresh: () => {
      targets.refresh(RefreshStrategy.Lazy);
      verifies.refresh(RefreshStrategy.Lazy);
    },
  };
}
