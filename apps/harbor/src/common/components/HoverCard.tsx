import * as HoverCardPrimitive from '@rn-primitives/hover-card';
import { type ReactNode, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { isWeb } from '../util/platform';

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
  let body: ReactNode = null;
  if (ready) {
    body = animated ? <RevealView>{children}</RevealView> : children;
  }

  const content = (
    <HoverCardPrimitive.Content {...props}>{body}</HoverCardPrimitive.Content>
  );

  return (
    <HoverCardPrimitive.Portal>
      {isWeb ? (
        content
      ) : (
        <HoverCardPrimitive.Overlay style={StyleSheet.absoluteFill}>
          {content}
        </HoverCardPrimitive.Overlay>
      )}
    </HoverCardPrimitive.Portal>
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
