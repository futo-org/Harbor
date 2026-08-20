import {
  type QuerySource,
  RefreshStrategy,
  useQuery,
} from '@/src/common/query/hooks/useQuery';
import type { v2 } from '@polycentric/react-native';
import { useMemo } from 'react';
import {
  type ClaimWithStatus,
  decodeVerificationClaimBundle,
} from '../utils/claim-status';
import { useVerifierIdentities } from './useVerifierIdentities';

/**
 * Shared pipeline for claim-bundle list queries: decode each bundle into a
 * claim with its verification status, newest first. `parse` must be a
 * stable function reference.
 */
export function useClaimBundleList(
  queryKey: string[],
  querySource: QuerySource,
  parse: (bytes: Uint8Array) => v2.VerificationClaimBundle[],
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
      return parse(new Uint8Array(query.data))
        .map((group) => decodeVerificationClaimBundle(group, verifierBots))
        .filter((c): c is ClaimWithStatus => c !== null)
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
