import { shouldExtend } from '@/src/common/lib/polycentric-hooks';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import { Query, QueryStatus, UpdateMode, v2 } from '@polycentric/react-native';
import { useMemo } from 'react';

export type FollowListMode = 'following' | 'followers';

export interface FollowEntry {
  // The identity the row shows: the followed identity for `following`,
  // the follower for `followers`.
  identity: string;
  createdAt: bigint;
}

function extractToken(data: ArrayBuffer | undefined): string | undefined {
  if (!data) return undefined;
  try {
    return v2.ListFollowsResponse.fromBinary(new Uint8Array(data)).pageInfo
      ?.endCursor;
  } catch {
    return undefined;
  }
}

/** Decode the merged pages into rows; returns [entries, hasNextPage]. */
function decodeEntries(
  data: ArrayBuffer | undefined,
  mode: FollowListMode,
): [FollowEntry[], boolean] {
  if (!data || data.byteLength === 0) return [[], false];
  try {
    const response = v2.ListFollowsResponse.fromBinary(new Uint8Array(data));

    // An identity may have several live follow events (e.g. one per
    // signing key) — keep the first (newest) per identity.
    const seen = new Set<string>();
    const entries: FollowEntry[] = [];
    for (const bundle of response.eventBundles) {
      if (!bundle.signedEvent || !bundle.serializedContent?.contentBytes) {
        continue;
      }
      try {
        const event = v2.Event.fromBinary(bundle.signedEvent.eventBytes);
        const content = v2.Content.fromBinary(
          bundle.serializedContent.contentBytes,
        );
        if (content.contentBody.oneofKind !== 'follow' || !event.key) continue;

        const identity =
          mode === 'following'
            ? content.contentBody.follow.identity
            : event.key.identity;
        if (!identity || seen.has(identity)) continue;
        seen.add(identity);
        entries.push({ identity, createdAt: event.createdAt });
      } catch {}
    }

    return [entries, response.pageInfo?.hasNextPage ?? false];
  } catch {
    return [[], false];
  }
}

/** Paginated follow-edge list for an identity, newest first. */
export function useFollowList(
  mode: FollowListMode,
  identityId: string | null | undefined,
  limit?: number,
) {
  const identity = identityId ?? '';

  const query = useQuery(
    ['follow-list', mode, identity],
    (_status, data) => {
      const args = { identity, limit, forwardToken: extractToken(data) };
      return mode === 'following'
        ? new Query.ListFollowing(args)
        : new Query.ListFollowers(args);
    },
    { updateMode: UpdateMode.Merge },
    !!identityId,
  );

  const [entries, hasNext] = useMemo(
    () => decodeEntries(query.data, mode),
    [query.data, mode],
  );

  return {
    entries,
    isLoading: query.status === QueryStatus.Loading,
    error: query.error ? new Error(query.error) : null,
    hasMore: hasNext,
    loadMore: () => {
      if (shouldExtend(hasNext, query)) query.extend();
    },
    refresh: () => query.refresh(RefreshStrategy.Lazy),
  };
}
