import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

/** Background tabs start their queries this long after mount. */
const EAGER_LOAD_DELAY_MS = 3000;

/**
 * Screen should start loading its data either immediately on
 * first focus or after `delayMs` in the background
 */
export function useEagerLoad(delayMs = EAGER_LOAD_DELAY_MS): boolean {
  const [enabled, setEnabled] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setEnabled(true);
    }, []),
  );

  useEffect(() => {
    if (enabled) return;
    const timer = setTimeout(() => setEnabled(true), delayMs);
    return () => clearTimeout(timer);
  }, [enabled, delayMs]);

  return enabled;
}
