import { useQuery } from '@/src/common/query/hooks/useQuery';
import { COLLECTION, Query, v2 } from '@polycentric/react-native';
import { useMemo } from 'react';
import { DecodedClaim, decodeClaimBundle } from './useClaimById';

/**
 * List the verification claims created by an identity, newest first.
 */
export function useClaimsList(identity: string | undefined): {
  claims: DecodedClaim[];
  isLoading: boolean;
} {
  const enabled = !!identity;

  const query = useQuery(
    ['list-events', String(COLLECTION.VERIFICATIONS), identity ?? ''],
    new Query.ListEvents({
      identity: identity ?? '',
      collection: COLLECTION.VERIFICATIONS,
      size: 100,
    }),
    undefined,
    enabled,
  );

  const claims = useMemo<DecodedClaim[]>(() => {
    if (!enabled || !query.data || query.data.byteLength === 0) return [];
    try {
      const response = v2.ListEventsResponse.fromBinary(
        new Uint8Array(query.data),
      );
      return response.eventBundles
        .map(decodeClaimBundle)
        .filter((c): c is DecodedClaim => c !== null)
        .sort((a, b) => Number(b.sequence - a.sequence));
    } catch {
      return [];
    }
  }, [enabled, query.data]);

  return { claims, isLoading: query.isLoading };
}
