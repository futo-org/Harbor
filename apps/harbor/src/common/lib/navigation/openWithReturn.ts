import { router, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';

// Whether the current modal route was pushed by an in-app tap — meaning
// there is a real place to return to — as opposed to a cold load of its
// URL (refresh, shared link). Close handlers can't tell the two apart via
// `router.canGoBack()`: the root stack anchors on the tabs, so even a
// cold load synthesizes history and canGoBack() reads true — backing up
// would land on the feed instead of the modal's parent.
let returnAvailable = false;

/** Push a route, marking that close can return to the current screen. */
export function openWithReturn(href: Href) {
  returnAvailable = true;
  router.push(href);
}

/**
 * Whether this screen was reached via {@link openWithReturn}. Consumes
 * the bit on mount so a later cold load in the same JS context doesn't
 * inherit it.
 */
export function useCanReturn(): boolean {
  const canReturn = useRef(returnAvailable);
  useEffect(() => {
    returnAvailable = false;
  }, []);
  return canReturn.current;
}
