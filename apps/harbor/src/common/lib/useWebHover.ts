import { hasPointerHover } from '@/src/common/util/platform';
import { useCallback, useState } from 'react';
import type { PressableProps } from 'react-native';

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
  const [hovered, setHovered] = useState(false);

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

  if (!hasPointerHover) {
    return { hovered: false, onHoverIn: undefined, onHoverOut: undefined };
  }

  return { hovered, onHoverIn, onHoverOut };
}
