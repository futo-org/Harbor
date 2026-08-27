import { useEffect } from 'react';
import { isWeb } from '@/src/common/util/platform';

/**
 * Locks document scroll while `locked` (no-op off web).
 * Fixing the body (offset by the current scroll) keeps the page visually
 * in place — plain `overflow: hidden` clamps the document scroll back to
 * 0 — and the saved offset is restored on unlock.
 */
export function useBodyScrollLock(enabled: boolean) {
  useEffect(() => {
    if (!isWeb || !enabled) return;

    const body = document.body;
    const y = window.scrollY;

    body.style.position = 'fixed';
    body.style.top = `-${y}px`;
    body.style.left = '0';
    body.style.right = '0';

    return () => {
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';

      window.scrollTo(0, y);
    };
  }, [enabled]);
}
