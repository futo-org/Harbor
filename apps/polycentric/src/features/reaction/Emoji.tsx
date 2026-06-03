import { Atoms, useTheme } from '@/src/common/theme';
import { ComponentProps } from 'react';
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
  style?: ComponentProps<typeof Pressable>['style'];
};
export const Emoji = ({
  style,
  emoji,
  onPress,
  selected = false,
}: EmojiProps) => {
  const { theme } = useTheme();

  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const bounceIn = () => {
    scale.value = withSpring(1.25, { damping: 6, stiffness: 220, mass: 0.5 });
  };
  const bounceOut = () => {
    scale.value = withSpring(1, { damping: 14, stiffness: 220, mass: 0.5 });
  };

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={bounceIn}
      onHoverOut={bounceOut}
      onPressIn={bounceIn}
      onPressOut={bounceOut}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        Atoms.rounded_full,
        (state.hovered || selected) && {
          backgroundColor: theme.palette.neutral_100,
        },
      ]}
    >
      <Animated.View style={animatedStyle}>
        <Text style={{ fontSize: 20 }}>{emoji}</Text>
      </Animated.View>
    </Pressable>
  );
};
