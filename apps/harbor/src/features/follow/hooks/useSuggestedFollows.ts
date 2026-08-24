import {
  shouldExtend,
  useCurrentIdentity,
} from '@/src/common/lib/polycentric-hooks';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import { Query, QueryStatus, UpdateMode, v2 } from '@polycentric/react-native';
import { useMemo } from 'react';

export interface FollowSuggestionEntry {
  /** The suggested identity. */
  identity: string;
  /** Identities the viewer follows that follow this one. */
  followers: string[];
}

function extractToken(data: ArrayBuffer | undefined): string | undefined {
  if (!data) return undefined;
  try {
    return v2.SuggestFollowResponse.fromBinary(new Uint8Array(data)).pageInfo
      ?.endCursor;
  } catch {
    return undefined;
  }
}

/** Decode the merged pages into rows; returns [entries, hasNextPage]. */
function decodeEntries(
  data: ArrayBuffer | undefined,
): [FollowSuggestionEntry[], boolean] {
  if (!data || data.byteLength === 0) return [[], false];
  try {
    const response = v2.SuggestFollowResponse.fromBinary(new Uint8Array(data));

    // Suggestions are Identity events; the core has already merged them to
    // one per identity, best connected first.
    const entries: FollowSuggestionEntry[] = [];
    for (const suggestion of response.suggestions) {
      const signedEvent = suggestion.suggestion?.signedEvent;
      if (!signedEvent) continue;
      try {
        const event = v2.Event.fromBinary(signedEvent.eventBytes);
        const identity = event.key?.identity;
        if (!identity) continue;
        entries.push({ identity, followers: suggestion.followers });
      } catch {}
    }

    return [entries, response.pageInfo?.hasNextPage ?? false];
  } catch {
    return [[], false];
  }
}

/**
 * Identities the current identity could follow: those followed by the
 * identities it already follows. The server reads the caller from the auth
 * token, so this holds until an identity exists.
 */
export function useSuggestedFollows(
  /** Set false to hold the query, e.g. for a tab page that is off screen. */
  enabled = true,
  limit?: number,
) {
  const { identityKey } = useCurrentIdentity();

  const query = useQuery(
    ['suggest-follow', identityKey ?? ''],
    (_status, data) =>
      new Query.SuggestFollow({ limit, forwardToken: extractToken(data) }),
    { updateMode: UpdateMode.Merge },
    enabled && !!identityKey,
  );

  const [entries, hasNext] = useMemo(
    () => decodeEntries(query.data),
    [query.data],
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
