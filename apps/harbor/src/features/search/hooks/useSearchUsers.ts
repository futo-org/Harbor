import { shouldExtend } from '@/src/common/lib/polycentric-hooks';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import { Query, QueryStatus, UpdateMode, v2 } from '@polycentric/react-native';
import { useMemo } from 'react';
import { searchQueryKeys } from './useSearchPosts';

export interface UserSearchEntry {
  identity: string;
}

function extractToken(data: ArrayBuffer | undefined): string | undefined {
  if (!data) return undefined;
  try {
    return v2.SearchUsersResponse.fromBinary(new Uint8Array(data)).pageInfo
      ?.endCursor;
  } catch {
    return undefined;
  }
}

/** Decode the merged pages into rows; returns [entries, hasNextPage]. */
function decodeEntries(
  data: ArrayBuffer | undefined,
): [UserSearchEntry[], boolean] {
  if (!data || data.byteLength === 0) return [[], false];
  try {
    const response = v2.SearchUsersResponse.fromBinary(new Uint8Array(data));

    // Results are ProfileUpdate events; the author is the matched user.
    // An identity may match with several profile events — keep the first.
    const seen = new Set<string>();
    const entries: UserSearchEntry[] = [];
    for (const result of response.results) {
      if (!result.eventBundle?.signedEvent) continue;
      try {
        const event = v2.Event.fromBinary(
          result.eventBundle.signedEvent.eventBytes,
        );
        const identity = event.key?.identity;
        if (!identity || seen.has(identity)) continue;
        seen.add(identity);
        entries.push({ identity });
      } catch {}
    }

    return [entries, response.pageInfo?.hasNextPage ?? false];
  } catch {
    return [[], false];
  }
}

export function useSearchUsers(
  searchQuery: string,
  options?: { limit?: number; enabled?: boolean },
) {
  const enabled = (options?.enabled ?? true) && searchQuery.length > 0;

  const query = useQuery(
    searchQueryKeys.users(searchQuery),
    (_status, data) =>
      new Query.SearchUsers({
        query: searchQuery,
        limit: options?.limit,
        forwardToken: extractToken(data),
      }),
    { updateMode: UpdateMode.Merge },
    enabled,
  );

  const [entries, hasNext] = useMemo(
    () => decodeEntries(query.data),
    [query.data],
  );

  return {
    entries,
    isLoading: query.status === QueryStatus.Loading,
    isRefreshing: query.hasPendingRefresh,
    error: query.error ? new Error(query.error) : null,
    hasMore: hasNext,
    loadMore: () => {
      if (shouldExtend(hasNext, query)) query.extend();
    },
    refresh: () => query.refresh(RefreshStrategy.Lazy),
  };
}
