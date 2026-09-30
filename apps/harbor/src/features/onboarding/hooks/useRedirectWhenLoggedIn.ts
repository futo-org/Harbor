import { Routes } from '@/src/common/constants';
import { usePolycentricContext } from '@/src/common/lib/polycentric-hooks';
import { type Href, router } from 'expo-router';
import { useEffect, useRef } from 'react';

/**
 * Redirects to the home page if the user is already logged in.
 * Useful in onboarding screens.
 */
export function useRedirectWhenLoggedIn(enabled: boolean) {
  const { currentIdentity, isLoading, isReady } = usePolycentricContext();
  const alreadyCheckedRef = useRef(false);

  useEffect(() => {
    if (!enabled || alreadyCheckedRef.current || isLoading || !isReady) return;
    alreadyCheckedRef.current = true;
    if (currentIdentity) router.dismissTo(Routes.tabs.feed.index as Href);
  }, [enabled, isLoading, isReady, currentIdentity]);
}
