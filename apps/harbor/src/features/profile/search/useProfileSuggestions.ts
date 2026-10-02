import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { useFollowList } from '@/src/features/follow/hooks/useFollowList';
import { useDebouncedValue } from '@/src/features/search/hooks/useDebouncedValue';
import { useSearchUsers } from '@/src/features/search/hooks/useSearchUsers';
import { useMemo } from 'react';

export type ProfileSuggestionSource = 'following' | 'search';

export interface ProfileSuggestion {
  identity: string;
  source: ProfileSuggestionSource;
}

export interface ProfileSuggestionsResult {
  suggestions: ProfileSuggestion[];
  /** True while the follow list is still loading. */
  isLoading: boolean;
  /** True while the user search is waiting on the typing pause or network. */
  isSearching: boolean;
}

// How many follow edges to list when the query is empty.
const FOLLOWING_LIMIT = 100;

const SEARCH_LIMIT = 10;

/**
 * Suggests identities for a partially-typed profile query:
 * - people the current user follows, when the query is empty,
 * - user search results from the network (names, aliases, and identity ids),
 *   like the main search screen.
 */
export function useProfileSuggestions(
  query: string,
  opts?: { exclude?: readonly string[] },
): ProfileSuggestionsResult {
  const { identityKey } = useCurrentIdentity();
  const following = useFollowList(
    'following',
    identityKey,
    true,
    FOLLOWING_LIMIT,
  );

  const trimmed = query.trim();

  const debounced = useDebouncedValue(trimmed);
  const search = useSearchUsers(trimmed ? debounced : '', {
    limit: SEARCH_LIMIT,
  });
  const isSearching =
    trimmed.length > 0 && (debounced !== trimmed || search.isLoading);

  const excludeJoined = (opts?.exclude ?? []).join('\n');

  const suggestions = useMemo(() => {
    const exclude = new Set(excludeJoined ? excludeJoined.split('\n') : []);
    const source: ProfileSuggestionSource = trimmed ? 'search' : 'following';
    const entries = trimmed ? search.entries : following.entries;
    return entries
      .filter((entry) => !exclude.has(entry.identity))
      .map((entry) => ({ identity: entry.identity, source }));
  }, [trimmed, search.entries, following.entries, excludeJoined]);

  return {
    suggestions,
    isLoading: following.isLoading,
    isSearching,
  };
}
