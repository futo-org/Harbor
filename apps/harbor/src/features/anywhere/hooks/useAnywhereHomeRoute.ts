import { Routes } from '@/src/common/constants';
import { useFeatureFlag } from '@/src/common/feature-flags';
import { isWeb } from '@/src/common/util/platform';

/**
 * Where Anywhere's screens go back to when there is no history. Its tab
 * cannot be opened on native while the feature flag hides it.
 */
export function useAnywhereHomeRoute() {
  const anywhereEnabled = useFeatureFlag('anywhere');
  return anywhereEnabled || isWeb
    ? Routes.tabs.anywhere.index
    : Routes.tabs.explore.index;
}
