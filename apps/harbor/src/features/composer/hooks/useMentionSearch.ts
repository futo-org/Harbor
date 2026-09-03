import { useEffect, useId } from 'react';
import { useSearchUsers } from '@/src/features/search/hooks/useSearchUsers';
import { useDebouncedValue } from '@/src/features/search/hooks/useDebouncedValue';
import { selectMentionQuery, useMentionStore } from './useMentionStore';

/**
 * Mention autocomplete data for the overlays: the debounced query derived
 * from the host's mention store and its user search results.
 */
export function useMentionSearch() {
  const rawQuery = useMentionStore(selectMentionQuery)?.trim() ?? null;
  const query = useDebouncedValue(rawQuery);

  const users = useSearchUsers(query ?? '', {
    limit: 10,
    enabled: !!query,
    // Per host (useId): the compose tab stays mounted under a reply sheet, and
    // a shared key would let the two overwrite each other's results.
    queryKey: ['mentions_autocomplete', useId()],
  });

  // Stable queryKey + manual refresh. Keying by the search string gives an empty
  // `entries` frame on every query change while the new request is in flight,
  // which closes the overlay. Under a stable key useQuery never refetches on
  // its own, so refresh on each query change — except the first non-empty one,
  // where `enabled` flipping already subscribed and fetched.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only react to query change
  useEffect(() => {
    if (query && !users.isLoading) users.refresh();
  }, [query]);

  // Under the stable key the last results linger; drop them once the query
  // is emptied (backspaced down to a bare `@`).
  const entries = query ? users.entries : [];

  return {
    open: rawQuery !== null && entries.length > 0,
    entries,
  };
}
