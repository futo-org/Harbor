import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { bytesToHex } from '@/src/common/lib/polycentric-hooks/helpers';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import { COLLECTION, Query, v2 } from '@polycentric/react-native';
import { useMemo } from 'react';
import { type DecodedClaim, decodeClaimBundle } from './useClaimById';

/**
 * The current identity's claims with a pending verification request aimed at
 * `targetIdentity`. One `ListEvents` query yields both the claims and their
 * `VerificationTarget` events. "Pending" means "requested" until a query
 * for the verifier's `VerificationVerify` events exists.
 */
export function useVerificationRequestsTo(targetIdentity: string | undefined): {
  claims: DecodedClaim[];
  isLoading: boolean;
  refresh: () => void;
} {
  const { identityKey } = useCurrentIdentity();
  const enabled = !!identityKey && !!targetIdentity;

  const query = useQuery(
    ['verification-requests', identityKey ?? '', targetIdentity ?? ''],
    new Query.ListEvents({
      identity: identityKey ?? '',
      collection: COLLECTION.VERIFICATIONS,
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

      const claimsById = new Map<string, DecodedClaim>();
      const requestedIds = new Set<string>();
      for (const bundle of response.eventBundles) {
        const claim = decodeClaimBundle(bundle);
        if (claim) {
          claimsById.set(claim.id, claim);
          continue;
        }
        if (!bundle.serializedContent?.contentBytes) continue;
        try {
          const content = v2.Content.fromBinary(
            bundle.serializedContent.contentBytes,
          );
          if (content.contentBody.oneofKind !== 'verificationTarget') continue;
          const target = content.contentBody.verificationTarget;
          if (!target.claimEventKey) continue;
          if (!target.targetIdentities.includes(targetIdentity!)) continue;
          requestedIds.add(
            bytesToHex(v2.EventKey.toBinary(target.claimEventKey)),
          );
        } catch {}
      }

      return [...requestedIds]
        .map((id) => claimsById.get(id))
        .filter((claim): claim is DecodedClaim => !!claim)
        .sort((a, b) => Number(b.sequence - a.sequence));
    } catch {
      return [];
    }
  }, [enabled, query.data, targetIdentity]);

  return {
    claims,
    isLoading: query.isLoading,
    refresh: () => query.refresh(RefreshStrategy.Lazy),
  };
}
