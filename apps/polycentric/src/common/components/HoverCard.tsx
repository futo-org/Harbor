import * as HoverCardPrimitive from '@rn-primitives/hover-card';
import { StyleSheet } from 'react-native';
import Animated, { BounceIn, FadeOut } from 'react-native-reanimated';


export function HoverCardContent({ children, ...props }: HoverCardPrimitive.ContentProps) {
    return <HoverCardPrimitive.Portal>
        <HoverCardPrimitive.Overlay style={StyleSheet.absoluteFill}>
            <HoverCardPrimitive.Content {...props}>
                <Animated.View entering={BounceIn.duration(450)} exiting={FadeOut.duration(100)}>
                    {children}
                </Animated.View>
            </HoverCardPrimitive.Content>
        </HoverCardPrimitive.Overlay>
    </HoverCardPrimitive.Portal>
}

function HoverCard({ children, ...props }: HoverCardPrimitive.RootProps) {
    return <HoverCardPrimitive.Root {...props}>{children}</HoverCardPrimitive.Root>;
}

HoverCard.Trigger = HoverCardPrimitive.Trigger;
HoverCard.Content = HoverCardContent;

export type { TriggerRef } from "@rn-primitives/hover-card";

export default HoverCard;