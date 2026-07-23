import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface BanListState {
  // True while a page (for the current query) is loading.
  isLoading: boolean;
  // The current page's banned identities, most recently banned first.
  bans: string[];
  // 1-based page number, for display.
  page: number;
  hasPrev: boolean;
  hasNext: boolean;
  goPrev: () => void;
  goNext: () => void;
  // Unbans `identity` and removes it from the current page.
  unban: (identity: string) => Promise<void>;
}

/**
 * A page-navigated, filterable view of the identities banned on `server`
 * (`IdentityService.ListBans`), plus a mutation to unban one
 * (`IdentityService.SetBanStatus`). The active identity must be a
 * moderator on `server`. Resets to the first page whenever `query`
 * changes; queries only while `enabled` is true.
 *
 * The wire API only pages forward (a cursor per next page), so we
 * remember the `after` cursor for each visited page to allow going back.
 */
export default function useBanList(
  server: string,
  query: string,
  enabled: boolean,
): BanListState {
  const client = usePolycentric();
  const [bans, setBans] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [pageIndex, setPageIndex] = useState<number>(0);
  const [hasNext, setHasNext] = useState<boolean>(false);

  // `after` cursor for each page index; index 0 is the unpaged first
  // page (empty cursor). Loading page N records the cursor for N+1.
  const cursorsRef = useRef<string[]>(['']);
  // Bumped per load so a stale response (query changed mid-flight) is
  // discarded on arrival.
  const generationRef = useRef<number>(0);

  const loadPage = useCallback(
    (index: number) => {
      if (!enabled) return;
      const generation = ++generationRef.current;
      setIsLoading(true);

      client
        .listBans(server, {
          query: query || undefined,
          after: cursorsRef.current[index] || undefined,
        })
        .then((result) => {
          if (generation !== generationRef.current) return;
          setBans(result.bans);
          setPageIndex(index);
          setHasNext(result.hasNextPage);
          // Cursor to fetch the page after this one.
          cursorsRef.current[index + 1] = result.endCursor;
        })
        .catch((err) => {
          console.error('Failed to fetch ban list:', err);
        })
        .finally(() => {
          if (generation === generationRef.current) setIsLoading(false);
        });
    },
    [client, server, query, enabled],
  );

  // Reset to the first page on mount and whenever the query/server
  // changes (loadPage's identity changes with them).
  useEffect(() => {
    cursorsRef.current = [''];
    loadPage(0);
  }, [loadPage]);

  const goPrev = useCallback(() => {
    if (!isLoading && pageIndex > 0) loadPage(pageIndex - 1);
  }, [isLoading, pageIndex, loadPage]);

  const goNext = useCallback(() => {
    if (!isLoading && hasNext) loadPage(pageIndex + 1);
  }, [isLoading, hasNext, pageIndex, loadPage]);

  const unban = useCallback(
    async (identity: string) => {
      await client.setBanStatus(server, identity, false);
      setBans((prev) => prev.filter((banned) => banned !== identity));
    },
    [client, server],
  );

  return {
    isLoading,
    bans,
    page: pageIndex + 1,
    hasPrev: pageIndex > 0,
    hasNext,
    goPrev,
    goNext,
    unban,
  };
}
