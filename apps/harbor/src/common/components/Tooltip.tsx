import { type ReactNode, useId, useRef, useState } from 'react';
import {
  Dimensions,
  Pressable,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';
import { Portal } from '@rn-primitives/portal';
import { Atoms, useTheme, ZIndex } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { Text } from './primitives';

const MAX_BUBBLE_WIDTH = 260;
const EDGE_MARGIN = 8;

/**
 * Wraps a trigger with a text bubble. Opens on hover (web) and on tap
 * (native).
 *
 * NOTE: this deliberately does not use the shared HoverCard. HoverCard portals
 * its content to the app-root host and positions it in absolute window
 * coordinates, but a tooltip may live inside a TrueSheet whose content is
 * offset from the window origin, so a portaled card would render either
 * behind the sheet (root host) or mispositioned (sheet-local host). Instead:
 * web portals out (to clear the sheet's `overflow: hidden`), native renders
 * the bubble in place relative to the trigger (within the sheet).
 */
export function Tooltip({
  text,
  children,
  accessibilityLabel,
  hitSlop = 6,
  style,
}: {
  text: string;
  children: ReactNode;
  accessibilityLabel?: string;
  hitSlop?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const portalName = `tooltip-${useId()}`;
  const triggerRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, h: 0 });

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
    Atoms.pt_sm,
    Atoms.pb_sm,
    Atoms.pl_md,
    Atoms.pr_md,
    Atoms.rounded_md,
    {
      maxWidth: MAX_BUBBLE_WIDTH,
      borderWidth: 1,
      borderColor: theme.palette.neutral_50,
      backgroundColor: theme.palette.neutral_25,
    },
  ] as const;

  const bubbleBody = (
    <Text variant="small" color="neutral_600" fontWeight="semibold">
      {text}
    </Text>
  );

  return (
    <View
      ref={triggerRef}
      collapsable={false}
      style={[{ position: 'relative' }, style]}
    >
      <Pressable
        onHoverIn={show}
        onHoverOut={hide}
        onPress={() => (open ? hide() : show())}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? text}
        hitSlop={hitSlop}
      >
        {children}
      </Pressable>

      {open && isWeb ? (
        <Portal name={portalName}>
          <View
            style={[
              bubbleStyle,
              {
                position: 'fixed' as 'absolute',
                top: anchor.y + anchor.h + 6,
                left: Math.max(
                  EDGE_MARGIN,
                  Math.min(
                    anchor.x,
                    Dimensions.get('window').width -
                      MAX_BUBBLE_WIDTH -
                      EDGE_MARGIN,
                  ),
                ),
                zIndex: ZIndex.tooltipOverlay,
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
              top: '100%',
              marginTop: 6,
              left: 0,
              zIndex: ZIndex.tooltip,
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
