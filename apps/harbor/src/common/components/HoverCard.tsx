import * as HoverCardPrimitive from '@rn-primitives/hover-card';
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import {
  Keyboard,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewInstance,
} from 'react-native';
import Animated, {
  Easing,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ZIndex } from '../theme';
import { isWeb } from '../util/platform';
import { useSheetPortalHost } from './sheet/useSheetPortalHost';

/**
 * Reveal wrapper for the hover card: fades in while zooming from 80% -> 100%.
 *
 * Driven by a shared value and `useAnimatedStyle` rather than...
 *  - A layout `entering` animation which gets displaced on web: the animation
 *    clean-up will end up transforming it downwards, creating a jump after
 *    appearing
 *  - A pre-built `reanimated` animation which is not implemented for web in our
 *    version of `reanimated`
 */
function RevealView({ children }: { children: ReactNode }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    // Start on the next frame: when mounting takes long (a slow render, or
    // loading data), starting right away skips the first part of the reveal.
    const frame = requestAnimationFrame(() => {
      progress.value = withTiming(1, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.8 + 0.2 * progress.value }],
  }));

  // Create a wrapper for the exit animation, so that there aren't overlapping
  // animations for opacity.
  return (
    <Animated.View exiting={FadeOut.duration(120)}>
      <Animated.View style={style}>{children}</Animated.View>
    </Animated.View>
  );
}

export function HoverCardContent({
  children,
  animated = true,
  ready = true,
  ...props
}: HoverCardPrimitive.ContentProps & {
  /** Animate the reveal. Set false for an instant, static card. */
  animated?: boolean;
  /**
   * Hold the card back while it is open but its content isn't ready (e.g.
   * still loading); it shows, and the reveal starts, once this turns true.
   */
  ready?: boolean;
}) {
  // Read here: the portal renders where its host is, outside this context
  const sheetPortalHost = useSheetPortalHost();

  let body: ReactNode = null;
  if (ready) {
    body = animated ? <RevealView>{children}</RevealView> : children;
  }

  if (isWeb) {
    return (
      <HoverCardPrimitive.Portal>
        <HoverCardPrimitive.Content
          {...props}
          // Radix renders the card at the end of <body>, under open modals
          style={{ zIndex: ZIndex.tooltipOverlay, ...props.style }}
        >
          {body}
        </HoverCardPrimitive.Content>
      </HoverCardPrimitive.Portal>
    );
  }

  return (
    <HoverCardPrimitive.Portal hostName={sheetPortalHost?.name}>
      <HoverCardPrimitive.Overlay style={StyleSheet.absoluteFill}>
        {sheetPortalHost ? (
          <SheetHoverCardContent {...props} hostRef={sheetPortalHost.ref}>
            {body}
          </SheetHoverCardContent>
        ) : (
          <HoverCardPrimitive.Content {...props}>
            {body}
          </HoverCardPrimitive.Content>
        )}
      </HoverCardPrimitive.Overlay>
    </HoverCardPrimitive.Portal>
  );
}

/**
 * The card inside a native sheet's portal host. The trigger and the host are
 * both measured from the sheet's corner, so the card is placed relative to the
 * host and kept within its bounds, which the sheet clips to.
 */
function SheetHoverCardContent({
  children,
  insets,
  hostRef,
  ...props
}: HoverCardPrimitive.ContentProps & {
  hostRef: RefObject<ViewInstance | null>;
}) {
  const window = useWindowDimensions();
  const [hostFrame, setHostFrame] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  useLayoutEffect(() => {
    // The keyboard would cover the card, and its edge can't be told in the
    // sheet's coordinates
    Keyboard.dismiss();
    hostRef.current?.measure((_x, _y, width, height, pageX, pageY) =>
      setHostFrame({ x: pageX, y: pageY, width, height }),
    );
  }, [hostRef]);

  if (!hostFrame) return null;

  return (
    <View
      pointerEvents="box-none"
      // The window's frame in the host's coordinates, where the card's
      // trigger-based position applies. Covering the whole host keeps the
      // card inside this view, so it gets touches.
      style={{
        position: 'absolute',
        left: -hostFrame.x,
        top: -hostFrame.y,
        width: window.width,
        height: window.height,
      }}
    >
      <HoverCardPrimitive.Content
        {...props}
        // The host's edges, as distances from the window's
        insets={{
          top: (insets?.top ?? 0) + hostFrame.y,
          left: (insets?.left ?? 0) + hostFrame.x,
          right:
            (insets?.right ?? 0) + window.width - hostFrame.x - hostFrame.width,
          bottom:
            (insets?.bottom ?? 0) +
            window.height -
            hostFrame.y -
            hostFrame.height,
        }}
      >
        {children}
      </HoverCardPrimitive.Content>
    </View>
  );
}

function HoverCard({ children, ...props }: HoverCardPrimitive.RootProps) {
  return (
    <HoverCardPrimitive.Root {...props}>{children}</HoverCardPrimitive.Root>
  );
}

HoverCard.Trigger = HoverCardPrimitive.Trigger;
HoverCard.Content = HoverCardContent;

export type { TriggerRef } from '@rn-primitives/hover-card';

export default HoverCard;
