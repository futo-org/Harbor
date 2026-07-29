import { AVATAR_SIZE_MAP } from '@/src/common/components/Avatar/Avatar';
import { useTheme, withHexOpacity } from '@/src/common/theme';
import { Fragment, type ReactNode, useEffect } from 'react';
import { View } from 'react-native';
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

export const AVATAR_SIZE = AVATAR_SIZE_MAP.md;

const PULSE_MS = 900;

export function useShimmerOpacity() {
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);
  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

/** Height of a placeholder text bar. */
const BAR_HEIGHT = 12;

/**
 * A single placeholder rectangle.
 * Height is a fixed constant by default, so pass in both width and height to
 * get a square.
 */
export function Block({
  width,
  height = BAR_HEIGHT,
  radius,
}: {
  width: number | `${number}%`;
  height?: number;
  radius?: number;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius ?? height / 2,
        backgroundColor: withHexOpacity(theme.palette.neutral_500, '20'),
      }}
    />
  );
}

/** Repeats a placeholder row `count` times. */
export function SkeletonList({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows never reorder
        <Fragment key={i}>{children}</Fragment>
      ))}
    </View>
  );
}
