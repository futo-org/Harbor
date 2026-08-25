import type { FeedTab } from '@/src/features/feed/hooks/feedCache';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { isWeb } from '@/src/common/util/platform';
import { emitFocusedRefresh } from '@/src/common/lib/navigation/useFocusedRefresh';
import { Routes } from '@/src/common/constants';

export type ExploreTab = 'posts' | 'people';

/**
 * Explore page tabs are not persisted
 * On web the URL owns it
 * On native it is a plain screen state seeded from the route.
 */
export function useExploreTab(routeTab: ExploreTab) {
  const router = useRouter();
  const [nativeTab, setNativeTab] = useState<ExploreTab>(routeTab);
  const tab = isWeb ? routeTab : nativeTab;

  const onTabPress = (next: FeedTab) => {
    if (next === tab) {
      emitFocusedRefresh();
      return;
    }

    if (next !== 'posts' && next !== 'people') return;

    if (isWeb) {
      router.push(
        next === 'people'
          ? Routes.tabs.explore.people
          : Routes.tabs.explore.index,
      );
    } else {
      setNativeTab(next);
    }
  };

  return { tab, onTabPress };
}
