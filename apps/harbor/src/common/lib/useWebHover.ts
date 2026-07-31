import { isWeb } from '@/src/common/util/platform';
import { useCallback, useEffect, useState } from 'react';
import type { PressableProps } from 'react-native';

/** Prefer hover + fine pointer (mouse / trackpad). Excludes touch-primary UIs. */
const POINTER_HOVER_MEDIA = '(hover: hover) and (pointer: fine)';

function getPointerHoverSupported(): boolean {
  if (!isWeb || typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }
  return window.matchMedia(POINTER_HOVER_MEDIA).matches;
}

/**
 * Pointer hover for RN Web when the device reports fine-pointer + hover-capable
 * UI (typical desktop / laptop). On native, `hovered` stays false and hover
 * handlers are omitted. On phones, tablets, and other touch-primary web
 * surfaces, hover is disabled so tap does not trigger spurious hover styles.
 */
export function useWebHover(): {
  hovered: boolean;
  onHoverIn: PressableProps['onHoverIn'];
  onHoverOut: PressableProps['onHoverOut'];
} {
  const [canPointerHover, setCanPointerHover] = useState(
    getPointerHoverSupported,
  );
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    setCanPointerHover(getPointerHoverSupported());
  }, []);

  useEffect(() => {
    if (!canPointerHover) setHovered(false);
  }, [canPointerHover]);

  const onHoverIn = useCallback<
    NonNullable<PressableProps['onHoverIn']>
  >(() => {
    setHovered(true);
  }, []);

  const onHoverOut = useCallback<
    NonNullable<PressableProps['onHoverOut']>
  >(() => {
    setHovered(false);
  }, []);

  if (!canPointerHover) {
    return { hovered: false, onHoverIn: undefined, onHoverOut: undefined };
  }

  return { hovered, onHoverIn, onHoverOut };
}
