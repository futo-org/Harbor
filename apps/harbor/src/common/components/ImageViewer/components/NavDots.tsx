import { View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  interpolate,
} from 'react-native-reanimated';
import { Atoms, withHexOpacity, useTheme } from '@/src/common/theme';

// Animated dots for carousel-like UIs
export function NavDots({
  count,
  offset,
  width,
}: {
  count: number;
  offset: SharedValue<number>;
  width: number;
}) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        Atoms.p_sm,
        Atoms.rounded_lg,
        Atoms.flex_row,
        Atoms.gap_xs,
        { backgroundColor: withHexOpacity(theme.palette.black, 'b0') },
      ]}
    >
      {Array.from({ length: count }).map((_, index) => (
        <NavDot
          // biome-ignore lint/suspicious/noArrayIndexKey: dots are defined by their index
          key={index}
          index={index}
          offset={offset}
          width={width}
        />
      ))}
    </View>
  );
}

function NavDot({
  index,
  offset,
  width,
}: {
  index: number;
  offset: SharedValue<number>;
  width: number;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(
      offset.value,
      [(-index - 1) * width, -index * width, (-index + 1) * width],
      [0.3, 1, 0.3],
      'clamp',
    ),
    transform: [
      {
        scale: interpolate(
          offset.value,
          [(-index - 1) * width, -index * width, (-index + 1) * width],
          [0.7, 1, 0.7],
          'clamp',
        ),
      },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: 'white',
        },
        style,
      ]}
    ></Animated.View>
  );
}
