import { RETURN_TO_PARAM, Routes, safeReturnTo } from '@/src/common/constants';
import { type Href, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

/**
 * Transparently handles onboarding routes and the `returnTo` param.
 */
export function useOnboardingLinks(returnTo?: string) {
  const param = useLocalSearchParams()[RETURN_TO_PARAM] as string | undefined;
  const target = safeReturnTo(returnTo ?? param);

  /** Create a route to `pathname` with `returnTo`. */
  const to = useCallback(
    <T extends string>(pathname: T) => {
      return target
        ? { pathname, params: { [RETURN_TO_PARAM]: target } }
        : pathname;
    },
    [target],
  );

  return {
    signup: to(Routes.onboarding.signup.index),
    login: to(Routes.onboarding.login),
    pair: to(Routes.onboarding.pair),
    recover: to(Routes.onboarding.recover),
    landing: (target ?? Routes.tabs.explore.index) as Href,
    to,
  };
}
