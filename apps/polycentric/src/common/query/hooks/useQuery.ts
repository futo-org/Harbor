import { useEffect, useRef } from 'react';
import {
  FetchMode,
  Query,
  QueryOpts,
  QueryStatus,
  type PolycentricClient,
} from '@polycentric/react-native';
import { create } from 'zustand';
import { usePolycentric } from '../../lib/polycentric-hooks';

export type QueryRef = {
  data: ArrayBuffer | undefined;
  status: QueryStatus;
  error: string | null;
};

type QueryArgs = {
  client: PolycentricClient;
  queryKey: string[];
  query: Query;
  opts: QueryOpts | undefined;
};

type SubscriptionRef = {
  refCount: number;
  dispose: () => void;
  args: QueryArgs;
};

type QueryStoreState = {
  queries: Map<string, QueryRef>;
  subscriptions: Map<string, SubscriptionRef>;
  subscribe: (key: string, args: QueryArgs) => void;
  unsubscribe: (key: string) => void;
  refresh: (key: string, args?: QueryArgs) => void;
  invalidate: (key: string, args?: QueryArgs) => void;
};

const EMPTY_ENTRY: QueryRef = Object.freeze({
  data: undefined,
  status: QueryStatus.Loading,
  error: null,
});

export const useQueryStore = create<QueryStoreState>((set, get) => {
  const updateQueryRef = (key: string, patch: Partial<QueryRef>) => {
    set((state) => {
      const prev = state.queries.get(key) ?? EMPTY_ENTRY;
      const merged = { ...prev, ...patch };
      if (
        merged.data === prev.data &&
        merged.status === prev.status &&
        merged.error === prev.error
      ) {
        return {};
      }
      const next = new Map(state.queries);
      next.set(key, merged);
      return { queries: next };
    });
  };

  const fetch = (key: string, args: QueryArgs): (() => void) => {
    // Set query to loading state
    updateQueryRef(key, {
      status: QueryStatus.Loading,
      error: null,
    });
    // Request from rs-core
    const observable = args.client.core.fetchQuery(
      args.queryKey,
      args.query,
      args.opts,
    );
    // Listen for outputs from relevant servers
    const sub = observable.subscribe({
      next(result) {
        updateQueryRef(key, { data: result.data, status: result.status });
      },
      error(message) {
        updateQueryRef(key, { error: message, status: QueryStatus.Error });
      },
      complete() {
        // Terminal status already arrived via the final `next`.
      },
    });
    // Dispose of the subscription if we cancel the fetch
    return () => sub.unsubscribe();
  };

  return {
    queries: new Map(),
    subscriptions: new Map(),

    subscribe(key, args) {
      const existing = get().subscriptions.get(key);
      if (existing) {
        existing.refCount += 1;
        existing.args = args;

        if (args.opts?.fetchMode === FetchMode.Default) {
          console.log(`Trying to refetch ${key}`);
          existing.dispose();
          existing.dispose = fetch(key, args);
        }

        return;
      }
      get().subscriptions.set(key, {
        refCount: 1,
        dispose: fetch(key, args),
        args,
      });
    },

    unsubscribe(key) {
      const subscription = get().subscriptions.get(key);
      if (!subscription) return;
      subscription.refCount -= 1;
      if (subscription.refCount === 0) {
        subscription.dispose();
        get().subscriptions.delete(key);
      }
    },

    refresh(key, args) {
      const sub = get().subscriptions.get(key);
      if (!sub) return;
      const next = args ?? sub.args;
      sub.dispose();
      sub.args = next;
      sub.dispose = fetch(key, next);
    },

    invalidate(key, args) {
      const sub = get().subscriptions.get(key);
      const target = args ?? sub?.args;
      if (target) target.client.core.invalidateQuery(target.queryKey);
      if (sub && target) {
        sub.dispose();
        sub.args = target;
        // Keep stale `data` visible — `fetch` flips status to
        // Loading and the new fan-out's `next` emissions will
        // overwrite as fresh results arrive.
        sub.dispose = fetch(key, target);
      }
    },
  };
});

export type UseQueryResult = QueryRef & {
  isLoading: boolean;
  /** Re-run the fan-out. Cached data stays visible until the new responses arrive. */
  refresh: () => void;
  /**
   * Drop the rust-side cache for this key, then re-run the fan-out.
   * Optional `opts` overrides the original `QueryOpts` for this run
   * (e.g. pass `{ fetchMode: FetchMode.Default }` to force a network
   * fetch when the original subscription used `OfflineOnly`).
   */
  invalidate: (opts?: QueryOpts) => void;
};

/**
 * Imperatively invalidate a query from outside a React component
 * (e.g. after a successful compose). Clears the rust-side cache and,
 * if a live subscription exists for this query, re-runs its fan-out
 * so the JS-side store gets fresh data.
 */
export function invalidateQuery(
  client: PolycentricClient,
  queryKey: string[],
): void {
  client.core.invalidateQuery(queryKey);
  useQueryStore.getState().refresh(queryKey.join('\0'));
}

/**
 * Subscribe to a rust-core query and share its state across every
 * consumer using the same `queryKey`. The first consumer kicks off
 * the rust-side fan-out; subsequent consumers refcount onto the same
 * subscription. `refresh` / `invalidate` re-run the shared fan-out
 * for every attached consumer. Set `enabled` to `false` to skip the
 * subscription entirely (the hook still returns cached state if any).
 */
export function useQuery(
  queryKey: string[],
  query: Query,
  opts: QueryOpts = { fetchMode: FetchMode.Default },
  enabled = true,
): UseQueryResult {
  const client = usePolycentric();
  const cacheKey = queryKey.join('\0');

  const entry = useQueryStore((s) => s.queries.get(cacheKey) ?? EMPTY_ENTRY);

  // Keep `argsRef` pointing at the freshest call args so the
  // imperative handlers below always see them without needing the
  // effect to re-run.
  const argsRef = useRef<QueryArgs>({ client, queryKey, query, opts });
  argsRef.current = { client, queryKey, query, opts };

  useEffect(() => {
    if (!enabled) return;
    const { subscribe: attach, unsubscribe: detach } = useQueryStore.getState();
    attach(cacheKey, argsRef.current);
    return () => detach(cacheKey);
  }, [cacheKey, enabled]);

  return {
    ...entry,
    isLoading: enabled && entry.status === QueryStatus.Loading,
    refresh: () => useQueryStore.getState().refresh(cacheKey, argsRef.current),
    invalidate: (overrideOpts?: QueryOpts) =>
      useQueryStore
        .getState()
        .invalidate(
          cacheKey,
          overrideOpts !== undefined
            ? { ...argsRef.current, opts: overrideOpts }
            : argsRef.current,
        ),
  };
}
