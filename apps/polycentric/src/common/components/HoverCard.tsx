import * as HoverCardPrimitive from '@rn-primitives/hover-card';
import { StyleSheet, View } from 'react-native';
import Animated, { BounceIn, FadeOut } from 'react-native-reanimated';
import { isWeb } from '../util/platform';

export function HoverCardContent({
  children,
  ...props
}: HoverCardPrimitive.ContentProps) {
  const content = (
    <HoverCardPrimitive.Content {...props}>
      <Animated.View
        entering={BounceIn.duration(450)}
        exiting={FadeOut.duration(100)}
      >
        {children}
      </Animated.View>
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
