import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import {
  RefreshStrategy,
  setQueryCache,
  useQuery,
} from '@/src/common/query/hooks/useQuery';
import { FetchMode, Query, v2 } from '@polycentric/react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
 * moderator on `server`. Each page is one `useQuery` subscription pinned
 * to `server` — bans are per-server — keyed by its cursor and the search
 * query. Resets to the first page whenever `query` changes; queries only
 * while `enabled` is true.
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
  const [pageIndex, setPageIndex] = useState<number>(0);

  // `after` cursor for each page index; index 0 is the unpaged first
  // page (empty cursor). Page N's response records the cursor for N+1.
  const cursorsRef = useRef<string[]>(['']);

  // Reset paging in-render when the server or search query changes, so
  // this same render already subscribes to the new first page.
  const paramsRef = useRef({ server, query });
  if (
    paramsRef.current.server !== server ||
    paramsRef.current.query !== query
  ) {
    paramsRef.current = { server, query };
    cursorsRef.current = [''];
    if (pageIndex !== 0) setPageIndex(0);
  }

  const after = cursorsRef.current[pageIndex] ?? '';
  const queryKey = ['list_bans', server, after, query];
  const result = useQuery(
    queryKey,
    new Query.ListBans({
      after: after || undefined,
      query: query || undefined,
    }),
    { fetchMode: FetchMode.Default, servers: [server] },
    enabled,
  );

  const response = useMemo(
    () =>
      result.data
        ? v2.ListBansResponse.fromBinary(new Uint8Array(result.data))
        : undefined,
    [result.data],
  );
  const bans = response?.bannedIdentities ?? [];
  const hasNext = response?.pageInfo?.hasNextPage ?? false;

  // Page N's response carries the cursor that fetches page N+1.
  useEffect(() => {
    if (response) {
      cursorsRef.current[pageIndex + 1] = response.pageInfo?.endCursor ?? '';
    }
  }, [response, pageIndex]);

  const goPrev = useCallback(() => {
    if (!result.isLoading && pageIndex > 0) setPageIndex(pageIndex - 1);
  }, [result.isLoading, pageIndex]);

  const goNext = useCallback(() => {
    if (!result.isLoading && hasNext) setPageIndex(pageIndex + 1);
  }, [result.isLoading, hasNext, pageIndex]);

  const unban = async (identity: string) => {
    await client.setBanStatus(server, identity, false);
    // The rust-side cache for this page still holds the unbanned
    // identity; drop it so the next fan-out re-asks the server.
    client.core.invalidateQuery(queryKey);
    const remaining = bans.filter((banned) => banned !== identity);
    if (remaining.length > 0 && response) {
      // Drop the row from the cached page immediately.
      const patched = v2.ListBansResponse.toBinary(
        v2.ListBansResponse.create({
          ...response,
          bannedIdentities: remaining,
        }),
      );
      setQueryCache(queryKey, { data: patched.buffer as ArrayBuffer });
      return;
    }
    // Unbanning the last row would leave an empty page still showing
    // stale Prev/Next controls and a page number. Reload so pagination
    // reflects the server: step back a page when possible, otherwise
    // refetch the first page (which pulls later rows up, or settles to a
    // clean empty state when nothing remains).
    if (pageIndex > 0) setPageIndex(pageIndex - 1);
    else result.refresh(RefreshStrategy.Eager);
  };

  return {
    isLoading: result.isLoading,
    bans,
    page: pageIndex + 1,
    hasPrev: pageIndex > 0,
    hasNext,
    goPrev,
    goNext,
    unban,
  };
}
