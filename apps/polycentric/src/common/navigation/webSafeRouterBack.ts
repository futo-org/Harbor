import { Routes } from '@/src/common/constants';
import { isWeb } from '@/src/common/util/platform';
import type { Href } from 'expo-router';
import { router } from 'expo-router';

export const WEB_SAFE_BACK_FALLBACK_HREF: Href = Routes.tabs.feed;

export function webSafeRouterBack(fallbackHref?: Href): void {
  const href = fallbackHref ?? WEB_SAFE_BACK_FALLBACK_HREF;
  if (!isWeb) {
    router.back();
    return;
  }
  if (!router.canGoBack()) {
    router.replace(href);
    return;
  }
  router.back();
}
