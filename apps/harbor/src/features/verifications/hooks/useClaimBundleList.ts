import {
  type QuerySource,
  RefreshStrategy,
  useQuery,
} from '@/src/common/query/hooks/useQuery';
import type { PostLabel } from '@/src/common/lib/polycentric-hooks/helpers';
import type { v2 } from '@polycentric/react-native-sdk';
import { useMemo } from 'react';
import {
  type ClaimWithStatus,
  decodeVerificationClaimBundle,
} from '../utils/claim-status';
import { useVerifierIdentities } from './useVerifierIdentities';

/**
 * Shared pipeline for claim-bundle list queries: decode each bundle into a
 * claim with its verification status and labels, newest first. `parse` must
 * be a stable function reference.
 */
export function useClaimBundleList(
  queryKey: string[],
  querySource: QuerySource,
  parse: (data: ArrayBuffer) => {
    bundles: v2.VerificationClaimBundle[];
    labelMap: Map<string, PostLabel[]>;
  },
  enabled: boolean,
): {
  claims: ClaimWithStatus[];
  isLoading: boolean;
  isRefreshing: boolean;
  refresh: () => void;
} {
  const query = useQuery(queryKey, querySource, undefined, enabled);
  const verifierBots = useVerifierIdentities();

  const claims = useMemo<ClaimWithStatus[]>(() => {
    if (!enabled || !query.data || query.data.byteLength === 0) return [];
    try {
      const { bundles, labelMap } = parse(query.data);
      return bundles
        .map((group) => decodeVerificationClaimBundle(group, verifierBots))
        .filter((c): c is ClaimWithStatus => c !== null)
        .map((claim) => ({ ...claim, labels: labelMap.get(claim.id) }))
        .sort((a, b) => Number(b.sequence - a.sequence));
    } catch {
      return [];
    }
  }, [enabled, query.data, parse, verifierBots]);

  return {
    claims,
    isLoading: query.isLoading,
    isRefreshing: query.hasPendingRefresh,
    refresh: () => query.refresh(RefreshStrategy.Lazy),
  };
}
