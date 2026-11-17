import { Routes } from '@/src/common/constants';
import { isWeb } from '@/src/common/util/platform';
import { router, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { isFromExtension } from '../lib/extension-origin';

/** Posted to the browser extension once the app can receive the tab. */
const READY_MESSAGE = 'harbor-browser-extension:ready';
/** Posted by the browser extension when the active tab's page changes. */
const TAB_MESSAGE = 'harbor-browser-extension:url';

/** The browser tab the extension is open beside. */
export type ExtensionTab = {
  url: string;
  title: string;
  /** As the page describes itself, where the extension can read it. */
  description?: string;
  image?: string;
  /** Its path, when it is on the Harbor site. */
  sitePath?: string;
};

const text = (value: unknown) => (value ? String(value) : undefined);

/**
 * The tab the extension reports. Kept in state, not route params: the
 * router's decoding corrupts escaped addresses.
 */
export function useExtensionTab(): ExtensionTab | undefined {
  const [tab, setTab] = useState<ExtensionTab>();

  // The panel stays mounted under a thread opened from it.
  const current = useRef({ tab, focused: true });
  current.current = {
    tab,
    focused: usePathname() === Routes.tabs.anywhere.browserExtension.panel,
  };

  useEffect(() => {
    if (!isWeb || window.parent === window) return;
    const onMessage = (event: MessageEvent) => {
      if (!isFromExtension(event)) return;
      if (event.data?.type !== TAB_MESSAGE) return;
      const next = {
        url: String(event.data.url ?? ''),
        title: String(event.data.title ?? ''),
        description: text(event.data.description),
        image: text(event.data.image),
        sitePath: text(event.data.sitePath),
      };
      const { tab: last, focused } = current.current;
      if (JSON.stringify(next) === JSON.stringify(last)) return;
      setTab(next);
      // A thread opened from here belongs to the page that was left.
      if (!focused && next.url !== (last?.url ?? '')) {
        router.dismissTo(Routes.tabs.anywhere.browserExtension.panel);
      }
    };
    window.addEventListener('message', onMessage);
    // The extension's origin differs per browser and install.
    window.parent.postMessage({ type: READY_MESSAGE }, '*');
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return tab;
}
