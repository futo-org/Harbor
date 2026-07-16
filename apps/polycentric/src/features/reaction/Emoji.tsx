import { Atoms, useTheme } from '@/src/common/theme';
import type { ComponentProps } from 'react';
import { Pressable, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

type EmojiProps = {
  emoji: string;
  onPress: () => void;
  selected?: boolean;
  /** When set, renders as a fixed-size circular button. Omit to keep the
   *  original content-sizing. */
  size?: number;
  style?: ComponentProps<typeof Pressable>['style'];
};
export const Emoji = ({
  style,
  emoji,
  onPress,
  selected = false,
  size,
}: EmojiProps) => {
  const { theme } = useTheme();

  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const bounceIn = () => {
    scale.value = withSpring(1.12, { damping: 10, stiffness: 220, mass: 0.3 });
  };
  const bounceOut = () => {
    scale.value = withSpring(1, { damping: 16, stiffness: 220, mass: 0.3 });
  };

  const fixedSizeStyle = size
    ? { width: size, height: size, borderRadius: size / 2 }
    : Atoms.rounded_full;

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={bounceIn}
      onHoverOut={bounceOut}
      onPressIn={bounceIn}
      onPressOut={bounceOut}
      style={(state) => [
        fixedSizeStyle,
        { alignItems: 'center', justifyContent: 'center' },
        typeof style === 'function' ? style(state) : style,
        (state.hovered || selected) && {
          backgroundColor: theme.palette.neutral_100,
        },
      ]}
    >
      <Animated.View style={animatedStyle}>
        <Text
          style={{
            fontSize: size ? size * 0.55 : 20,
            color: theme.palette.neutral_1000,
          }}
        >
          {emoji}
        </Text>
      </Animated.View>
    </Pressable>
  );
};
