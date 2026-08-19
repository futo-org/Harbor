import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { FeedTab } from './feedCache';

/** Feeds that carry their own settings. */
export type FeedName = 'following' | 'explore';

/** Per-feed view settings, remembered across restarts. */
export interface FeedSettings {
  tab: FeedTab;
}

interface FeedSettingsStore {
  feeds: Record<FeedName, FeedSettings>;
  setFeedSettings: (feed: FeedName, settings: Partial<FeedSettings>) => void;
}

export const useFeedSettingsStore = create<FeedSettingsStore>()(
  persist(
    (set) => ({
      feeds: {
        following: { tab: 'latest' },
        explore: { tab: 'top' },
      },

      setFeedSettings: (feed, settings) =>
        set((state) => ({
          feeds: {
            ...state.feeds,
            [feed]: { ...state.feeds[feed], ...settings },
          },
        })),
    }),
    {
      name: 'polycentric:feed-settings',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

/**
 * True once the stored settings have been read back. Callers hold their query
 * until then rather than fetching with defaults and immediately refetching.
 */
export function useFeedSettingsHydrated(): boolean {
  const [hydrated, setHydrated] = useState(
    useFeedSettingsStore.persist.hasHydrated(),
  );

  useEffect(() => {
    if (useFeedSettingsStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useFeedSettingsStore.persist.onFinishHydration(() =>
      setHydrated(true),
    );
  }, []);

  return hydrated;
}
