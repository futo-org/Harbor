import { queryPayload } from '@/src/common/lib/polycentric-hooks/helpers';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import {
  type EventKey,
  parseEventKeyId,
  Query,
  QueryData_Tags,
} from '@polycentric/react-native';
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
  isRefreshing: boolean;
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
  const key = parseEventKeyId(claimId);
  if (!key?.signedBy || !key.identity) return null;
  return key;
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
    if (!enabled) return [];
    const response = queryPayload(
      targets.data,
      QueryData_Tags.VerificationTargets,
    )?.response;
    return response ? decodeTargetIdentities(response.eventBundles) : [];
  }, [enabled, targets.data]);

  const verifiedBy = useMemo<Set<string>>(() => {
    if (!enabled) return new Set();
    const response = queryPayload(
      verifies.data,
      QueryData_Tags.VerificationVerifies,
    )?.response;
    return response
      ? decodeVerifierIdentities(response.eventBundles)
      : new Set();
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
    isRefreshing: targets.hasPendingRefresh || verifies.hasPendingRefresh,
    refresh: () => {
      targets.refresh(RefreshStrategy.Lazy);
      verifies.refresh(RefreshStrategy.Lazy);
    },
  };
}
