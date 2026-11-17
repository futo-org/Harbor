import { safeReturnTo } from '@/src/common/constants';
import { isWeb } from '@/src/common/util/platform';
import { type Href, router } from 'expo-router';
import { useEffect } from 'react';
import { NAVIGATE_MESSAGE } from '../lib/login-messages';

/**
 * Lets the browser extension move the Harbor tab it is open beside to
 * another page of the site, as a link in the app would.
 */
export function useExtensionNavigation() {
  useEffect(() => {
    if (!isWeb || window.parent !== window) return;
    // The extension's content script posts into this window.
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin)
        return;
      if (event.data?.type !== NAVIGATE_MESSAGE) return;
      const path = safeReturnTo(event.data.path);
      if (path) router.navigate(path as Href);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
}
