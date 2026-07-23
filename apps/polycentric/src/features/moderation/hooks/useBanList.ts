import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface BanListState {
  // True while the first page (for the current query) is loading.
  isLoading: boolean;
  // True while a subsequent page is loading.
  isLoadingMore: boolean;
  // Identities banned on the server, most recently banned first.
  bans: string[];
  // Whether another page follows the ones already loaded.
  hasMore: boolean;
  // Load and append the next page.
  loadMore: () => void;
  // Unbans `identity` and removes it from `bans`.
  unban: (identity: string) => Promise<void>;
}

/**
 * A paginated, filterable view of the identities banned on `server`
 * (`IdentityService.ListBans`), plus a mutation to unban one
 * (`IdentityService.SetBanStatus`). The active identity must be a
 * moderator on `server`. Refetches the first page whenever `query`
 * changes; queries only while `enabled` is true.
 */
export default function useBanList(
  server: string,
  query: string,
  enabled: boolean,
): BanListState {
  const client = usePolycentric();
  const [bans, setBans] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const cursorRef = useRef<string>('');
  // Bumped on every first-page load so in-flight requests from a stale
  // query (or a superseded loadMore) can be discarded on arrival.
  const generationRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;
    const generation = ++generationRef.current;
    setIsLoading(true);
    setBans([]);
    setHasMore(false);
    cursorRef.current = '';

    client
      .listBans(server, { query: query || undefined })
      .then((page) => {
        if (generation !== generationRef.current) return;
        setBans(page.bans);
        cursorRef.current = page.endCursor;
        setHasMore(page.hasNextPage);
      })
      .catch((err) => {
        console.error('Failed to fetch ban list:', err);
      })
      .finally(() => {
        if (generation === generationRef.current) setIsLoading(false);
      });
  }, [client, server, query, enabled]);

  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    const generation = generationRef.current;
    setIsLoadingMore(true);

    client
      .listBans(server, {
        query: query || undefined,
        after: cursorRef.current,
      })
      .then((page) => {
        // Drop the result if the query changed while this was in flight.
        if (generation !== generationRef.current) return;
        setBans((prev) => [...prev, ...page.bans]);
        cursorRef.current = page.endCursor;
        setHasMore(page.hasNextPage);
      })
      .catch((err) => {
        console.error('Failed to load more bans:', err);
      })
      .finally(() => {
        if (generation === generationRef.current) setIsLoadingMore(false);
      });
  }, [client, server, query, hasMore, isLoadingMore]);

  const unban = useCallback(
    async (identity: string) => {
      await client.setBanStatus(server, identity, false);
      setBans((prev) => prev.filter((banned) => banned !== identity));
    },
    [client, server],
  );

  return { isLoading, isLoadingMore, bans, hasMore, loadMore, unban };
}
