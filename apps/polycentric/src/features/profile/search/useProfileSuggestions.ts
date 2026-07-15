import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { useFollowList } from '@/src/features/follow/hooks/useFollowList';
import { useProfiles } from '@/src/features/profile/hooks/useProfiles';
import { normalizeAlias, resolveAlias } from '@polycentric/react-native';
import { useEffect, useMemo, useState } from 'react';

export type ProfileSuggestionSource = 'following' | 'alias' | 'identity';

export interface ProfileSuggestion {
  identity: string;
  name: string | null;
  alias: string | null;
  source: ProfileSuggestionSource;
}

export interface ProfileSuggestionsResult {
  suggestions: ProfileSuggestion[];
  /** True while the follow list is still loading. */
  isLoading: boolean;
  /** True while an alias-shaped query is waiting on network resolution. */
  isResolvingAlias: boolean;
}

/** Wait for a typing pause before hitting the alias domain's well-known. */
const ALIAS_DEBOUNCE_MS = 300;

// How many follow edges to search over. Aliases and pasted identity ids
// resolve regardless; only name-matching is bounded by this window.
const FOLLOWING_LIMIT = 100;

// Long enough to be an intentionally pasted identity id rather than a hex-ish
// name fragment (full ids are 64 hex chars).
const IDENTITY_ID_MIN_LENGTH = 32;

function isHex(s: string): boolean {
  return /^[0-9a-fA-F]+$/.test(s);
}

/**
 * Suggests identities for a partially-typed profile query:
 * - people the current user follows, matched on profile name, alias, or
 *   identity-id prefix (everyone followed when the query is empty),
 * - the identity behind a `user@domain` or bare-domain alias, resolved over
 *   the network,
 * - the query itself when it's a pasted identity id.
 *
 * TODO: matching runs client-side over the first FOLLOWING_LIMIT follow
 * edges, with names read from whatever profiles happen to be cached. Clean
 * this up with a local store / sync of followed identities' profiles (and
 * eventually a server-side profile search) so matching covers the whole
 * graph with fresh names.
 */
export function useProfileSuggestions(
  query: string,
  opts?: { exclude?: readonly string[] },
): ProfileSuggestionsResult {
  const { identityKey } = useCurrentIdentity();
  const following = useFollowList('following', identityKey, FOLLOWING_LIMIT);

  const followedIdentities = useMemo(
    () => following.entries.map((entry) => entry.identity),
    [following.entries],
  );
  const profiles = useProfiles(followedIdentities);

  const trimmed = query.trim();
  const aliasQuery = normalizeAlias(trimmed);

  // Debounced alias → identity resolution; the result remembers which alias
  // it answered so a stale response never surfaces for a newer query.
  const [resolved, setResolved] = useState<{
    alias: string;
    identity: string | null;
  } | null>(null);
  const [isResolvingAlias, setResolvingAlias] = useState(false);

  useEffect(() => {
    if (!aliasQuery) {
      setResolved(null);
      setResolvingAlias(false);
      return;
    }
    let cancelled = false;
    setResolvingAlias(true);
    const timer = setTimeout(() => {
      // resolveAlias never rejects — failures resolve to null.
      void resolveAlias(aliasQuery).then((identity) => {
        if (cancelled) return;
        setResolved({ alias: aliasQuery, identity });
        setResolvingAlias(false);
      });
    }, ALIAS_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [aliasQuery]);

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

    if (aliasQuery && resolved?.alias === aliasQuery && resolved.identity) {
      push({
        identity: resolved.identity,
        name: null,
        alias: aliasQuery,
        source: 'alias',
      });
    }

    if (
      !aliasQuery &&
      trimmed.length >= IDENTITY_ID_MIN_LENGTH &&
      isHex(trimmed)
    ) {
      push({
        identity: trimmed.toLowerCase(),
        name: null,
        alias: null,
        source: 'identity',
      });
    }

    // Strip a leading '@' so "@alice" matches names and aliases alike.
    const q = trimmed.toLowerCase().replace(/^@/, '');
    for (const entry of following.entries) {
      const profile = profiles.get(entry.identity) ?? null;
      if (q) {
        const matches =
          entry.identity.toLowerCase().startsWith(q) ||
          (profile?.name?.toLowerCase().includes(q) ?? false) ||
          (profile?.alias?.toLowerCase().includes(q) ?? false);
        if (!matches) continue;
      }
      push({
        identity: entry.identity,
        name: profile?.name ?? null,
        alias: profile?.alias ?? null,
        source: 'following',
      });
    }

    return out;
  }, [
    aliasQuery,
    resolved,
    trimmed,
    following.entries,
    profiles,
    excludeJoined,
  ]);

  return {
    suggestions,
    isLoading: following.isLoading,
    isResolvingAlias,
  };
}
