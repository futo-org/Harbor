import { usePolycentricContext } from '@/src/common/lib/polycentric-hooks';
import { redirectIfLoggedIn } from '@/src/features/onboarding/redirectIfLoggedIn';
import { useEffect, useRef } from 'react';

/**
 * Redirects to the home page if the user is already logged in.
 * Useful in onboarding screens.
 */
export function useRedirectWhenLoggedIn(enabled: boolean) {
  const { client, isReady } = usePolycentricContext();
  const alreadyCheckedRef = useRef(false);

  useEffect(() => {
    if (!enabled || alreadyCheckedRef.current || !isReady) return;
    alreadyCheckedRef.current = true;
    void redirectIfLoggedIn(client);
  }, [enabled, isReady, client]);
}
