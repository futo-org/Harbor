import { shouldExtend } from '@/src/common/lib/polycentric-hooks';
import {
  decodeBundle,
  queryPayload,
} from '@/src/common/lib/polycentric-hooks/helpers';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import {
  Query,
  type QueryData,
  QueryData_Tags,
  QueryStatus,
  UpdateMode,
} from '@polycentric/react-native';
import { useMemo } from 'react';

export type FollowListMode = 'following' | 'followers';

export interface FollowEntry {
  // The identity the row shows: the followed identity for `following`,
  // the follower for `followers`.
  identity: string;
  createdAt: bigint;
}

function extractToken(data: QueryData | undefined): string | undefined {
  return queryPayload(data, QueryData_Tags.Follows)?.response.pageInfo
    ?.endCursor;
}

/** Decode the merged pages into rows; returns [entries, hasNextPage]. */
function decodeEntries(
  data: QueryData | undefined,
  mode: FollowListMode,
): [FollowEntry[], boolean] {
  const response = queryPayload(data, QueryData_Tags.Follows)?.response;
  if (!response) return [[], false];

  // An identity may have several live follow events (e.g. one per
  // signing key) — keep the first (newest) per identity.
  const seen = new Set<string>();
  const entries: FollowEntry[] = [];
  for (const bundle of response.eventBundles) {
    const decoded = decodeBundle(bundle, 'follow');
    if (!decoded?.event.key) continue;

    const identity =
      mode === 'following'
        ? decoded.content.identity
        : decoded.event.key.identity;
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    entries.push({ identity, createdAt: decoded.event.createdAt });
  }

  return [entries, response.pageInfo?.hasNextPage ?? false];
}

/** Paginated follow-edge list for an identity, newest first. */
export function useFollowList(
  mode: FollowListMode,
  identityId: string | null | undefined,
  /** Set false to hold the query, e.g. for a tab page that is off screen. */
  enabled = true,
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
    enabled && !!identityId,
  );

  const [entries, hasNext] = useMemo(
    () => decodeEntries(query.data, mode),
    [query.data, mode],
  );

  return {
    entries,
    isLoading: query.status === QueryStatus.Loading,
    /** True only for a pull-to-refresh, not the first load. */
    isRefreshing: query.hasPendingRefresh,
    error: query.error ? new Error(query.error) : null,
    hasMore: hasNext,
    loadMore: () => {
      if (shouldExtend(hasNext, query)) query.extend();
    },
    refresh: () => query.refresh(RefreshStrategy.Lazy),
  };
}
