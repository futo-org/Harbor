import { isWeb } from '@/src/common/util/platform';
import { useEffect } from 'react';

/**
 * Navigations that pop and then change the URL (e.g. the sidebar's
 * `dismissAll()` + `navigate()`) run `history.go(-n)` and only then
 * `replaceState`/`pushState`. The new screen writes its title before the
 * traversal lands, so the browser files it under the entry being left and
 * keeps showing the landed entry's old title. Rewriting the title after each
 * traversal puts it on the current entry.
 */
export function useResyncTitleOnPopstate() {
  useEffect(() => {
    if (!isWeb) return;
    const resyncTitle = () => {
      const title = document.title;
      // The browser ignores assigning the title it already has.
      document.title = '';
      document.title = title;
    };
    window.addEventListener('popstate', resyncTitle);
    return () => window.removeEventListener('popstate', resyncTitle);
  }, []);
}
