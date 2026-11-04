import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { useFollowList } from '@/src/features/follow/hooks/useFollowList';
import { useProfiles } from '@/src/features/profile/hooks/useProfiles';
import { useDebouncedValue } from '@/src/features/search/hooks/useDebouncedValue';
import { useSearchUsers } from '@/src/features/search/hooks/useSearchUsers';
import { useMemo } from 'react';

export type ProfileSuggestionSource = 'following' | 'search' | 'identity';

export interface ProfileSuggestion {
  identity: string;
  name: string | null;
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

// Long enough to be an intentionally pasted identity id rather than a hex-ish
// name fragment (full ids are 64 hex chars).
const IDENTITY_ID_MIN_LENGTH = 32;

function isHex(s: string): boolean {
  return /^[0-9a-fA-F]+$/.test(s);
}

/**
 * Suggests identities for a partially-typed profile query:
 * - people the current user follows, when the query is empty,
 * - user search results from the network, like the main search screen,
 * - the query itself when it's a pasted identity id.
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

  const followedIdentities = useMemo(
    () => following.entries.map((entry) => entry.identity),
    [following.entries],
  );
  const profiles = useProfiles(followedIdentities);

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
    const seen = new Set<string>();
    const out: ProfileSuggestion[] = [];
    const push = (suggestion: ProfileSuggestion) => {
      if (!suggestion.identity) return;
      if (exclude.has(suggestion.identity) || seen.has(suggestion.identity)) {
        return;
      }
      seen.add(suggestion.identity);
      out.push(suggestion);
    };

    if (trimmed.length >= IDENTITY_ID_MIN_LENGTH && isHex(trimmed)) {
      push({
        identity: trimmed.toLowerCase(),
        name: null,
        source: 'identity',
      });
    }

    if (trimmed) {
      for (const entry of search.entries) {
        push({
          identity: entry.identity,
          name: null,
          source: 'search',
        });
      }
    } else {
      for (const entry of following.entries) {
        const profile = profiles.get(entry.identity) ?? null;
        push({
          identity: entry.identity,
          name: profile?.name ?? null,
          source: 'following',
        });
      }
    }

    return out;
  }, [trimmed, search.entries, following.entries, profiles, excludeJoined]);

  return {
    suggestions,
    isLoading: following.isLoading,
    isSearching,
  };
}
