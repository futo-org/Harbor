import { usePolycentricContext } from '@/src/common/lib/polycentric-hooks';
import { redirectIfLoggedInAs } from '@/src/features/onboarding/redirectIfLoggedInAs';
import { useEffect } from 'react';

/**
 * Redirects to the home page if the user already has a login for the
 * specified identity.
 * The functionality is enabled when `identity` is defined.
 * Useful in onboarding screens.
 */
export function useRedirectWhenLoggedInAs(identity: string | undefined) {
  const { client, isReady } = usePolycentricContext();

  useEffect(() => {
    if (!identity || !isReady) return;

    redirectIfLoggedInAs(client, identity).catch((err: unknown) => {
      console.warn('failed to check for an existing login:', err);
    });
  }, [identity, isReady, client]);
}
