import { useSyncExternalStore } from 'react';
import { useSettings } from '@/src/common/settings';
import { resolveFeatureFlag } from '../lib/resolve-feature-flag';
import type { FeatureFlag } from '../lib/flags';

const NONE = {};

/** Whether `flag` is on; see `resolveFeatureFlag` for what decides it. */
export function useFeatureFlag(flag: FeatureFlag): boolean {
  // The server render has no stored state, and the first client render has to
  // match it.
  const hydrated = useSyncExternalStore(
    useSettings.persist.onFinishHydration,
    useSettings.persist.hasHydrated,
    () => false,
  );
  const switched = useSettings((state) => state.featureFlags);
  return resolveFeatureFlag(flag, hydrated ? switched : NONE);
}
