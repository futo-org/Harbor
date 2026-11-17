import { Routes } from '@/src/common/constants';
import { type Href, router, useFocusEffect, usePathname } from 'expo-router';
import { type ReactElement, useCallback } from 'react';
import { OPEN_SITE_MESSAGE } from '../../lib/login-messages';

/** Root stack screens the extension shows: its own, threads and replying. */
function isExtensionScreen(name: string): boolean {
  return (
    name === 'anywhere/browser-extension/panel' ||
    name === 'feed' ||
    name.startsWith('[identityId]/post/')
  );
}

/** A `screenLayout` that opens every other screen on the Harbor site. */
export function extensionScreenLayout({
  children,
  route,
}: {
  children: ReactElement;
  route: { name: string };
}) {
  return isExtensionScreen(route.name) ? children : <OpenOnSite />;
}

function OpenOnSite() {
  const path = usePathname();

  // Only once navigated to: the tabs also sit unfocused under the stack.
  useFocusEffect(
    useCallback(() => {
      window.parent.postMessage({ type: OPEN_SITE_MESSAGE, path }, '*');
      if (router.canGoBack()) router.back();
      else router.replace(Routes.tabs.anywhere.browserExtension.panel as Href);
    }, [path]),
  );

  return null;
}
