import { create } from 'zustand';
import {
  Query,
  QueryStatus,
  v2,
  type PolycentricClient,
} from '@polycentric/react-native';
import {
  decodeV2PostBundle,
  type PostData,
} from '@/src/common/lib/polycentric-hooks';

type FeedKey = string;

type Sub = { unsubscribe: () => void };

export type FeedEntry = {
  items: PostData[];
  isLoading: boolean;
  error: Error | null;
};

const EMPTY_ITEMS: PostData[] = [];

/**
 * Stable empty entry used as the selector fallback. Returning a fresh
 * `{}` on each render would defeat zustand's `Object.is` short-circuit
 * and force every consumer to re-render on any unrelated store update.
 */
export const EMPTY_FEED: FeedEntry = Object.freeze({
  items: EMPTY_ITEMS,
  isLoading: false,
  error: null,
});

type FeedsState = {
  feeds: Map<FeedKey, FeedEntry>;
  setFeed: (key: FeedKey, patch: Partial<FeedEntry>) => void;
  /**
   * Subscribe to the underlying rust observable for `key`. Returns
   * an unsubscribe function — the caller (the hook's `useEffect`)
   * owns the subscription's lifetime. State stays in the store, so
   * remount sees the cached items immediately while a fresh fan-out
   * runs on the rust side (`FetchMode::Default` always re-fetches
   * unless one is already in flight).
   */
  subscribe: (
    client: PolycentricClient,
    key: FeedKey,
    queryKey: string[],
    query: Query,
  ) => () => void;
  /**
   * Prepend a locally-authored post (deduped by id). Used by the
   * `useLocalPosts` listener so newly-created posts appear without
   * waiting for the server round-trip.
   */
  insertLocal: (key: FeedKey, post: PostData) => void;
};

export const useFeedsStore = create<FeedsState>((set, get) => {
  const writeFeed = (key: FeedKey, patch: Partial<FeedEntry>) => {
    set((state) => {
      const prev = state.feeds.get(key) ?? EMPTY_FEED;
      const merged = { ...prev, ...patch };
      // Skip the Map clone if nothing actually changed — keeps selector
      // identity stable across no-op writes (e.g. duplicate emissions
      // from multiple concurrent subscribers to the same key).
      if (
        merged.items === prev.items &&
        merged.isLoading === prev.isLoading &&
        merged.error === prev.error
      ) {
        return {};
      }
      const next = new Map(state.feeds);
      next.set(key, merged);
      return { feeds: next };
    });
  };

  const subscribe = (
    client: PolycentricClient,
    key: FeedKey,
    queryKey: string[],
    query: Query,
  ): (() => void) => {
    writeFeed(key, { isLoading: true, error: null });

    const observable = client.core.fetchQuery(queryKey, query, undefined);
    const sub: Sub = observable.subscribe({
      next: (result) => {
        if (result.data) {
          const response = v2.GetFeedResponse.fromBinary(
            new Uint8Array(result.data),
          );
          const items: PostData[] = [];
          for (const bundle of response.eventBundles) {
            const decoded = decodeV2PostBundle(bundle);
            if (decoded) items.push(decoded);
          }
          writeFeed(key, {
            items,
            isLoading: result.status === QueryStatus.Loading,
          });
        } else {
          writeFeed(key, {
            isLoading: result.status === QueryStatus.Loading,
          });
        }
      },
      error: (message: string) => {
        console.warn(`feed ${key} error:`, message);
        writeFeed(key, { error: new Error(message), isLoading: false });
      },
      complete: () => {
        writeFeed(key, { isLoading: false });
      },
    });

    return () => sub.unsubscribe();
  };

  return {
    feeds: new Map(),
    setFeed: writeFeed,
    subscribe,
    insertLocal: (key, post) => {
      const prev = get().feeds.get(key) ?? EMPTY_FEED;
      if (prev.items.some((p) => p.id === post.id)) return;
      writeFeed(key, { items: [post, ...prev.items] });
    },
  };
});
