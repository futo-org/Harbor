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

/**
 * Either a `Query` value or a function that can produce a `Query` from a previous
 * query's results.
 */
export type QuerySource =
  | Query
  | ((status: QueryStatus | undefined, data: ArrayBuffer | undefined) => Query);

export type QueryRef = {
  /** Latest query response data received from rs-core. */
  data: ArrayBuffer | undefined;

  /** The overall status of the fan-out query. */
  status: QueryStatus;

  /** Error message from rs-core, if any. */
  error: string | null;

  /**
   * The number of servers from the latest fan-out that have returned a
   * success response.
   */
  successfulServers: number;

  /**
   * The number of servers from the latest fan-out for which we are
   * still awaiting a response.
   */
  pendingServers: number | undefined;

  /**
   * Set to true when `pull()`, `update()`, or `reload()` are called and reset
   * to false once any server responds or the query completes.
   * This helps listeners distinguish between extending with more data versus
   * refreshing with fresh data in the cases where the existing data is not
   * invalidated immediately.
   */
  hasPendingRefresh: boolean;
};

type QueryArgs = {
  client: PolycentricClient;
  queryKey: QueryKey;
  query: Query;
  opts: QueryOpts | undefined;
};

type QueryKey = string[];

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
  pull: (key: string, args?: QueryArgs) => void;
  update: (key: string, args?: QueryArgs) => void;
  reload: (key: string, args?: QueryArgs) => void;
  extend: (key: string, args: QueryArgs) => void;
};

const EMPTY_ENTRY: QueryRef = Object.freeze({
  data: undefined,
  status: QueryStatus.Loading,
  error: null,
  successfulServers: 0,
  pendingServers: undefined,
  hasPendingRefresh: false,
});

const LOADING_ENTRY: Partial<QueryRef> = Object.freeze({
  status: QueryStatus.Loading,
  error: null,
  successfulServers: 0,
  pendingServers: undefined,
});

export const useQueryStore = create<QueryStoreState>((set, get) => {
  const updateQueryRef = (key: string, patch: Partial<QueryRef>) => {
    set((state) => {
      const prev = state.queries.get(key) ?? EMPTY_ENTRY;
      const merged = { ...prev, ...patch };
      if (
        merged.data === prev.data &&
        merged.status === prev.status &&
        merged.error === prev.error &&
        merged.successfulServers === prev.successfulServers &&
        merged.pendingServers === prev.pendingServers &&
        merged.hasPendingRefresh === prev.hasPendingRefresh
      ) {
        return {};
      }
      const next = new Map(state.queries);
      next.set(key, merged);
      return { queries: next };
    });
  };

  // Use this to force a query to reach to servers for new data.
  const forceRemote = (args: QueryArgs): QueryArgs => {
    return {
      ...args,
      opts: { ...args.opts, fetchMode: FetchMode.Default },
    };
  };

  const fetch = (
    key: string,
    args: QueryArgs,
    initState: Partial<QueryRef>,
  ): (() => void) => {
    // Set query to loading state
    updateQueryRef(key, initState);

    // Request from rs-core
    const observable = args.client.core.fetchQuery(
      args.queryKey,
      args.query,
      args.opts,
    );
    // Listen for outputs from relevant servers
    const sub = observable.subscribe({
      next(result) {
        let patch: Partial<QueryRef> = {
          data: result.data,
          status: result.status,
          successfulServers: result.successfulServers,
          pendingServers: result.pendingServers,
        };

        if (result.pendingServers === 0 || result.successfulServers > 0) {
          patch.hasPendingRefresh = false;
        }

        updateQueryRef(key, patch);
      },
      error(message) {
        console.warn(`useQuery[${key}] error: ${message}`);
        if (get().queries.get(key)?.status === QueryStatus.Error) {
          updateQueryRef(key, { error: message });
        }
      },
      complete() {
        // All query results are usually given to us from `next()` emissions.
        // However, we do need to handle the case where an offline query has no cached
        // data, leaving the query to complete without `next()` ever being called.
        let status = get().queries.get(key)?.status;
        if (status === undefined || status === QueryStatus.Loading) {
          // Treat no emissions as a success with no data
          status = QueryStatus.Success;
        }

        updateQueryRef(key, {
          status,
          hasPendingRefresh: false,
        });
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
          existing.dispose();
          existing.dispose = fetch(key, args, LOADING_ENTRY);
        }

        return;
      }
      get().subscriptions.set(key, {
        refCount: 1,
        dispose: fetch(key, args, LOADING_ENTRY),
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

    pull(key, args) {
      const sub = get().subscriptions.get(key);
      if (!sub) return;

      // Start new fan-out
      const next = forceRemote(args ?? sub.args);
      sub.dispose();
      sub.args = next;
      sub.dispose = fetch(key, next, {
        ...LOADING_ENTRY,
        hasPendingRefresh: true,
      });
    },

    update(key, args) {
      const sub = get().subscriptions.get(key);
      if (!sub) return;

      // Invalidate data in rs-core
      sub.args.client.core.invalidateQuery(sub.args.queryKey);

      // Start new fan-out
      const next = forceRemote(args ?? sub.args);
      sub.dispose();
      sub.args = next;
      sub.dispose = fetch(key, next, {
        ...LOADING_ENTRY,
        hasPendingRefresh: true,
      });
    },

    reload(key, args) {
      const sub = get().subscriptions.get(key);
      if (!sub) return;

      // Invalidate data in rs-core
      sub.args.client.core.invalidateQuery(sub.args.queryKey);

      // Start new fan-out and immediately invalidate cached data
      const next = forceRemote(args ?? sub.args);
      sub.dispose();
      sub.args = next;
      sub.dispose = fetch(key, next, {
        ...LOADING_ENTRY,
        hasPendingRefresh: true,
        data: undefined,
      });
    },

    extend(key, args) {
      const sub = get().subscriptions.get(key);
      if (!sub) return;

      sub.dispose();
      sub.dispose = fetch(key, args, LOADING_ENTRY);
    },
  };
});

export type UseQueryResult = QueryRef & {
  /**
   * True if we are still expecting emissions from the subscription.
   * Either we are waiting on at least one server or we are waiting on
   * the cached data.
   */
  isLoading: boolean;

  /**
   * Fetch new data with the existing subscription's args.
   * New data is applied according to the query's update mode.
   */
  pull: () => void;

  /**
   * Invalidate rust-side cache and pull in new data.
   * This subscription's existing data remains available until new data arrives.
   */
  update: () => void;

  /**
   * Immediately invalidate existing data and pull in new data.
   */
  reload: () => void;

  /**
   * Pull in new data after generating args from the query source, but without
   * updating the subscription's query args.
   * If the update mode is set to `Merge`, this allows pulling in more data
   * while still keeping all of the existing data.
   */
  extend: () => void;
};

/**
 * Invalidate rust-side cache for a key and request new data if
 * there are any subscribers.
 * if `lazy` is true (default), then the existing data will not be
 * removed until new data is available.
 */
export function invalidateQuery(
  client: PolycentricClient,
  queryKey: QueryKey,
  lazy?: boolean,
) {
  lazy = lazy ?? true;
  const key = queryKey.join('\0');

  // Both update() and reload() will be a no-op if no subscription is found for `key`.
  // However, we want to invalidate the rust-side cache even if there is no subscription.
  const sub = useQueryStore.getState().subscriptions.get(key);
  if (!sub) {
    client.core.invalidateQuery(queryKey);
  }

  if (lazy) {
    useQueryStore.getState().update(key);
  } else {
    useQueryStore.getState().reload(key);
  }
}

/**
 * Returns the current cache for a query key
 */
export function getQueryCache(queryKey: QueryKey): QueryRef | undefined {
  return useQueryStore.getState().queries.get(queryKey.join('\0'));
}

/**
 * Updates the local cache state for a query key
 */
export function setQueryCache(
  queryKey: QueryKey,
  value: Partial<QueryRef>,
): void {
  const cacheKey = queryKey.join('\0');
  useQueryStore.setState((state) => {
    const prev = state.queries.get(cacheKey) ?? EMPTY_ENTRY;
    const merged = { ...prev, ...value };
    if (
      merged.data === prev.data &&
      merged.status === prev.status &&
      merged.error === prev.error &&
      merged.successfulServers === prev.successfulServers &&
      merged.pendingServers === prev.pendingServers &&
      merged.hasPendingRefresh === prev.hasPendingRefresh
    ) {
      return {};
    }
    const next = new Map(state.queries);
    next.set(cacheKey, merged);
    return { queries: next };
  });
}

/**
 * Subscribe to a rust-core query and share its state across every consumer using
 * the same `queryKey`.
 * The first consumer kicks off the rust-side fan-out, and subsequent consumers
 * refcount onto the same subscription, sharing the same query results.
 * Set `enabled` to `false` to skip the subscription entirely (the hook still
 * returns cached state if any).
 *
 * Extending/infinite queries can be done by using the "merge" update mode and
 * providing a function for the query source.
 * Then, calling `extend()` will keep the query key and subscription the same,
 * while triggering a new fan-out that will be added to the existing data.
 */
export function useQuery(
  queryKey: QueryKey,
  querySource: QuerySource,
  opts: QueryOpts = { fetchMode: FetchMode.Default },
  enabled = true,
): UseQueryResult {
  const client = usePolycentric();
  const cacheKey = queryKey.join('\0');

  const entry = useQueryStore((s) => s.queries.get(cacheKey) ?? EMPTY_ENTRY);
  const query =
    typeof querySource === 'function'
      ? querySource(undefined, undefined)
      : querySource;

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
    pull: () => useQueryStore.getState().pull(cacheKey, argsRef.current),
    update: () => useQueryStore.getState().update(cacheKey, argsRef.current),
    reload: () => useQueryStore.getState().reload(cacheKey, argsRef.current),
    extend: () => {
      const query =
        typeof querySource === 'function'
          ? querySource(entry.status, entry.data)
          : querySource;

      useQueryStore
        .getState()
        .extend(cacheKey, { client, queryKey, query, opts });
    },
  };
}
