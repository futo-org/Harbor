import { shouldExtend } from '@/src/common/lib/polycentric-hooks';
import {
  bundleEvent,
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
import { searchQueryKeys } from './useSearchPosts';

export interface UserSearchEntry {
  identity: string;
}

function extractToken(data: QueryData | undefined): string | undefined {
  return queryPayload(data, QueryData_Tags.SearchUsers)?.response.pageInfo
    ?.endCursor;
}

/** Decode the merged pages into rows; returns [entries, hasNextPage]. */
function decodeEntries(
  data: QueryData | undefined,
): [UserSearchEntry[], boolean] {
  const response = queryPayload(data, QueryData_Tags.SearchUsers)?.response;
  if (!response) return [[], false];

  // Results are ProfileUpdate events; the author is the matched user.
  // An identity may match with several profile events — keep the first.
  const seen = new Set<string>();
  const entries: UserSearchEntry[] = [];
  for (const result of response.results) {
    const identity = bundleEvent(result.eventBundle)?.key?.identity;
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    entries.push({ identity });
  }

  return [entries, response.pageInfo?.hasNextPage ?? false];
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
