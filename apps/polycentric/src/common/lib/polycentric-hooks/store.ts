import { createStore, useStore as useZustandStore } from 'zustand';
import type { KeyPair, PolycentricClient } from '@polycentric/react-native';

type FeedEntry = {
  ids: string[];
  hasMore: boolean;
};

export interface PolycentricStore {
  identities: KeyPair[];
  refreshIdentities: () => Promise<void>;

  feeds: Record<string, FeedEntry>;
  feedVersions: Record<string, number>;

  setFeed: (feedKey: string, ids: string[], hasMore: boolean) => void;
  clearFeed: (feedKey: string) => void;
}

export function createPolycentricStore(client: PolycentricClient) {
  return createStore<PolycentricStore>()((set, get) => ({
    identities: [],
    async refreshIdentities() {
      set({ identities: await client.keyPairManager.getKeys() });
    },

    feeds: {},
    feedVersions: {},

    setFeed(feedKey, ids, hasMore) {
      const existing = get().feeds[feedKey];
      if (
        existing &&
        existing.hasMore === hasMore &&
        existing.ids.length === ids.length &&
        existing.ids.every((id, i) => id === ids[i])
      ) {
        return;
      }
      set((s) => ({
        feeds: { ...s.feeds, [feedKey]: { ids, hasMore } },
      }));
    },

    clearFeed(feedKey) {
      set((s) => {
        const { [feedKey]: _, ...rest } = s.feeds;
        return {
          feeds: rest,
          feedVersions: {
            ...s.feedVersions,
            [feedKey]: (s.feedVersions[feedKey] ?? 0) + 1,
          },
        };
      });
    },
  }));
}

export type PolycentricStoreApi = ReturnType<typeof createPolycentricStore>;

export function useStore<T>(
  store: PolycentricStoreApi,
  selector: (state: PolycentricStore) => T,
): T {
  return useZustandStore(store, selector);
}
