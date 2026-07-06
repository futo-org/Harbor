import * as HoverCardPrimitive from '@rn-primitives/hover-card';
import { StyleSheet, View } from 'react-native';
import Animated, { BounceIn, FadeOut } from 'react-native-reanimated';
import { isWeb } from '../util/platform';

export function HoverCardContent({
  children,
  animated = true,
  ...props
}: HoverCardPrimitive.ContentProps & {
  /** Animate the reveal (BounceIn). Set false for an instant, static card. */
  animated?: boolean;
}) {
  const content = (
    <HoverCardPrimitive.Content {...props}>
      {animated ? (
        <Animated.View
          entering={BounceIn.duration(450)}
          exiting={FadeOut.duration(100)}
        >
          {children}
        </Animated.View>
      ) : (
        children
      )}
    </HoverCardPrimitive.Content>
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
