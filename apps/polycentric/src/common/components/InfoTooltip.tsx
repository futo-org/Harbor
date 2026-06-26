import { useId, useRef, useState } from 'react';
import { Dimensions, Pressable, View } from 'react-native';
import { Portal } from '@rn-primitives/portal';
import { Atoms, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import Icon from './Icon';
import { Text } from './primitives';

const BUBBLE_WIDTH = 260;
const EDGE_MARGIN = 8;

/**
 * A small information icon that reveals an explanatory bubble. Opens on hover
 * (web) and on tap (native).
 *
 * On web the bubble is rendered through a Portal (to the app-root PortalHost)
 * and positioned against the icon's measured screen coordinates, so it escapes
 * the edit sheet's `overflow: hidden` card instead of being clipped at its
 * edge. On native the sheet doesn't clip absolute children that way (and a
 * root portal would sit behind the native sheet), so it renders in place.
 */
export function InfoTooltip({
  text,
  size = 15,
}: {
  text: string;
  size?: number;
}) {
  const { theme } = useTheme();
  const portalName = `info-tooltip-${useId()}`;
  const triggerRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  // Icon position in window coords; only needed for the web portal.
  const [anchor, setAnchor] = useState<{ x: number; y: number; h: number }>({
    x: 0,
    y: 0,
    h: 0,
  });

  const show = () => {
    if (isWeb && triggerRef.current) {
      triggerRef.current.measureInWindow((x, y, _w, h) => {
        setAnchor({ x, y, h });
        setOpen(true);
      });
    } else {
      setOpen(true);
    }
  };
  const hide = () => setOpen(false);

  const bubbleStyle = [
    Atoms.p_sm,
    {
      width: BUBBLE_WIDTH,
      maxWidth: BUBBLE_WIDTH,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.palette.neutral_300,
      backgroundColor: theme.palette.background_secondary,
    },
  ] as const;

  const bubbleBody = (
    <Text variant="small" color="neutral_900">
      {text}
    </Text>
  );

  return (
    <View ref={triggerRef} collapsable={false} style={{ position: 'relative' }}>
      <Pressable
        onHoverIn={show}
        onHoverOut={hide}
        onPress={() => (open ? hide() : show())}
        accessibilityRole="button"
        accessibilityLabel="More information"
        hitSlop={6}
      >
        <Icon name="infoOutline" size={size} color="neutral_500" />
      </Pressable>

      {open && isWeb ? (
        <Portal name={portalName}>
          <View
            style={[
              bubbleStyle,
              {
                // Window-fixed so it ignores the clipping card; clamped so the
                // bubble can't run off either screen edge.
                position: 'fixed' as 'absolute',
                top: anchor.y + anchor.h + 6,
                left: Math.max(
                  EDGE_MARGIN,
                  Math.min(
                    anchor.x,
                    Dimensions.get('window').width - BUBBLE_WIDTH - EDGE_MARGIN,
                  ),
                ),
                // Above the sheet's web overlay (zIndex 9999).
                zIndex: 10000,
              },
            ]}
          >
            {bubbleBody}
          </View>
        </Portal>
      ) : null}

      {open && !isWeb ? (
        <View
          style={[
            bubbleStyle,
            {
              position: 'absolute',
              top: size + 6,
              left: 0,
              zIndex: 1000,
              elevation: 8,
            },
          ]}
        >
          {bubbleBody}
        </View>
      ) : null}
    </View>
  );
}
