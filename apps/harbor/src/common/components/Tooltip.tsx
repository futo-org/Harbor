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
const GAP = 6;

/**
 * Wraps a trigger with a text bubble. Opens on hover (web) and on tap
 * (native, where a tap anywhere else closes it).
 *
 * The bubble is portaled to the app root and placed in window coordinates,
 * so it clears clipped parents and later siblings. Set `inline` for a
 * trigger inside a native sheet, which is presented above the root portal
 * host: the bubble then renders in place below the trigger.
 */
export function Tooltip({
  text,
  children,
  accessibilityLabel,
  hitSlop = 6,
  inline,
  style,
}: {
  text: string;
  children: ReactNode;
  accessibilityLabel?: string;
  hitSlop?: number;
  inline?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const portalName = `tooltip-${useId()}`;
  const triggerRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, h: 0 });

  const portaled = isWeb || !inline;

  const show = () => {
    if (portaled && triggerRef.current) {
      triggerRef.current.measureInWindow((x, y, _w, h) => {
        setAnchor({ x, y, h });
        setOpen(true);
      });
    } else {
      setOpen(true);
    }
  };
  const hide = () => setOpen(false);

  // The bubble sizes to its text inside a fixed-width, transparent box, since
  // an absolute child alone would be constrained by its parent's width.
  const bubble = (
    <View
      pointerEvents="box-none"
      style={[Atoms.items_start, { width: MAX_BUBBLE_WIDTH }]}
    >
      <View
        style={[
          Atoms.pt_sm,
          Atoms.pb_sm,
          Atoms.pl_md,
          Atoms.pr_md,
          Atoms.rounded_md,
          {
            borderWidth: 1,
            borderColor: theme.palette.neutral_50,
            backgroundColor: theme.palette.neutral_25,
          },
        ]}
      >
        <Text variant="small" color="neutral_600" fontWeight="semibold">
          {text}
        </Text>
      </View>
    </View>
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

      {open && portaled ? (
        <Portal name={portalName}>
          {!isWeb ? (
            <Pressable
              onPress={hide}
              style={[
                Atoms.absolute,
                Atoms.inset_0,
                { zIndex: ZIndex.tooltipOverlay },
              ]}
            />
          ) : null}
          <View
            pointerEvents="box-none"
            style={{
              position: isWeb ? ('fixed' as 'absolute') : 'absolute',
              top: anchor.y + anchor.h + GAP,
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
            }}
          >
            {bubble}
          </View>
        </Portal>
      ) : null}

      {open && !portaled ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: '100%',
            marginTop: GAP,
            left: 0,
            zIndex: ZIndex.tooltip,
            elevation: 8,
          }}
        >
          {bubble}
        </View>
      ) : null}
    </View>
  );
}
