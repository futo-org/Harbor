import { useEffect } from 'react';
import { useSearchUsers } from '@/src/features/search/hooks/useSearchUsers';
import { useDebouncedValue } from '@/src/features/search/hooks/useDebouncedValue';
import { selectMentionQuery, useMentionStore } from './useMentionStore';

/**
 * Mention autocomplete data for the overlays: the debounced query derived
 * from the host's mention store and its user search results.
 */
export function useMentionSearch() {
  const rawQuery = useMentionStore(selectMentionQuery)?.trim() ?? null;
  const query = useDebouncedValue(rawQuery?.trim());

  const users = useSearchUsers(query ?? '', {
    limit: 10,
    enabled: !!query,
    queryKey: ['mentions_autocomplete'],
  });

  // Stable queryKey + manual refresh. Keying by the search string gives an empty
  // `entries` frame on every query change while the new request is in flight,
  // which closes the overlay. Under a stable key useQuery never refetches on
  // its own, so refresh on each query change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only react to query change
  useEffect(() => {
    users.refresh();
  }, [query]);

  return {
    /** A mention is being completed (an open `@`) — show the overlay. */
    open: rawQuery !== null,
    // Under the stable key the last results linger; hide them once the query
    // is emptied (backspaced down to a bare `@`).
    entries: query ? users.entries : [],
  };
}
