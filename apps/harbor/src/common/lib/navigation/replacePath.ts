import { isWeb } from '@/src/common/util/platform';

/**
 * Point the address bar at `path` without navigating. Used by tabs on sibling
 * routes, where navigating would remount the screen. No-op off web.
 */
export function replacePath(path: string) {
  if (!isWeb) return;
  window.history.replaceState(null, '', path);
}
