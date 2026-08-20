import {
  eventKeyId,
  getKeyFingerprint,
} from '@/src/common/lib/polycentric-hooks/helpers';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import { COLLECTION, Query, v2 } from '@polycentric/react-native';
import { useMemo } from 'react';

/** Key of a claim the identity verified; the claim itself loads per row. */
export type VerifiedClaimKey = {
  id: string;
  identity: string;
  keyFingerprint: string;
  sequence: bigint;
};

/**
 * Claims by other identities that `identity` has verified, newest first.
 */
export function useVerifies(
  identity: string | undefined,
  enabled = true,
): {
  verifies: VerifiedClaimKey[];
  isLoading: boolean;
  isRefreshing: boolean;
  refresh: () => void;
} {
  const query = useQuery(
    ['verifies', identity ?? ''],
    new Query.ListEvents({
      identity: identity ?? '',
      collection: COLLECTION.VERIFICATIONS,
    }),
    undefined,
    enabled && !!identity,
  );

  const verifies = useMemo<VerifiedClaimKey[]>(() => {
    if (!query.data || query.data.byteLength === 0) return [];
    try {
      const response = v2.ListEventsResponse.fromBinary(
        new Uint8Array(query.data),
      );

      const seen = new Set<string>();
      const out: { key: VerifiedClaimKey; verifiedAt: bigint }[] = [];
      for (const bundle of response.eventBundles) {
        if (!bundle.signedEvent || !bundle.serializedContent?.contentBytes) {
          continue;
        }
        try {
          const content = v2.Content.fromBinary(
            bundle.serializedContent.contentBytes,
          );
          if (content.contentBody.oneofKind !== 'verificationVerify') continue;
          const key = content.contentBody.verificationVerify.claimEventKey;
          const keyFingerprint = getKeyFingerprint(key?.signedBy);
          if (!key || !keyFingerprint) continue;
          const id = eventKeyId(key);
          if (seen.has(id)) continue;
          seen.add(id);
          const event = v2.Event.fromBinary(bundle.signedEvent.eventBytes);
          out.push({
            key: {
              id,
              identity: key.identity,
              keyFingerprint,
              sequence: key.sequence,
            },
            verifiedAt: event.key?.sequence ?? 0n,
          });
        } catch {}
      }
      return out
        .sort((a, b) => Number(b.verifiedAt - a.verifiedAt))
        .map((entry) => entry.key);
    } catch {
      return [];
    }
  }, [query.data]);

  return {
    verifies,
    isLoading: query.isLoading,
    isRefreshing: query.hasPendingRefresh,
    refresh: () => query.refresh(RefreshStrategy.Lazy),
  };
}
