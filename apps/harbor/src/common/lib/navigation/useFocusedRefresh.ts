import { useCallback, useRef } from 'react';
import { useFocusEffect, useNavigation } from 'expo-router';
import { isWeb } from '@/src/common/util/platform';

/**
 * The single registered refresh handler for the currently focused
 * screen. Only one screen is ever focused at a time, so there's
 * nothing to multiplex.
 */
let currentRefresh: (() => void) | null = null;

/**
 * Calls refresh to consumers of `useFocusedRefresh` hooks
 */
export function emitFocusedRefresh(): void {
  currentRefresh?.();
}

/**
 * If the component is focused and a refresh is emitted, the hook is called.
 * Pager pages pass `enabled` to claim the slot only while shown.
 */
export function useFocusedRefresh(refresh: () => void, enabled = true): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // Claim the slot while focused; release it on blur. `useFocusEffect`
  // guarantees this aligns with the screen's actual focus state.
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      const fn = () => refreshRef.current();
      currentRefresh = fn;
      return () => {
        if (currentRefresh === fn) currentRefresh = null;
      };
    }, [enabled]),
  );

  const navigation = useNavigation();
  const navigationRef = useRef(navigation);
  navigationRef.current = navigation;

  useFocusEffect(
    useCallback(() => {
      if (isWeb || !enabled) return;
      return navigationRef.current.addListener('tabPress' as never, () => {
        if (navigationRef.current.isFocused()) emitFocusedRefresh();
      });
    }, [enabled]),
  );
}
