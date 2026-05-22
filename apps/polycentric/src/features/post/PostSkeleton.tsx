import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const AVATAR_SIZE = 40;
const PULSE_MS = 900;

function useShimmerOpacity() {
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

function Bar({
  width,
  height = 12,
}: {
  width: number | `${number}%`;
  height?: number;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        width,
        height,
        borderRadius: height / 2,
        backgroundColor: withHexOpacity(theme.palette.neutral_500, '20'),
      }}
    />
  );
}

export function PostSkeleton() {
  const { theme } = useTheme();
  const animatedStyle = useShimmerOpacity();

  return (
    <Animated.View
      style={[
        Atoms.w_full,
        Atoms.px_md,
        Atoms.pt_md,
        Atoms.pb_md,
        Atoms.flex_row,
        Atoms.gap_md,
        animatedStyle,
        {
          borderBottomWidth: 1,
          borderBottomColor: withHexOpacity(theme.palette.neutral_500, '20'),
        },
      ]}
    >
      <View
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderRadius: AVATAR_SIZE / 2,
          backgroundColor: withHexOpacity(theme.palette.neutral_500, '20'),
        }}
      />
      <View style={[Atoms.flex_1, Atoms.gap_sm]}>
        <View style={[Atoms.flex_row, Atoms.gap_sm, Atoms.align_center]}>
          <Bar width={120} />
          <Bar width={60} />
          <Bar width={40} />
        </View>
        <Bar width="100%" />
        <Bar width="80%" />
        <View style={[Atoms.flex_row, Atoms.gap_lg, Atoms.mt_sm]}>
          <Bar width={28} height={14} />
          <Bar width={28} height={14} />
          <Bar width={28} height={14} />
        </View>
      </View>
    </Animated.View>
  );
}

export function PostSkeletonList({ count = 6 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <PostSkeleton key={i} />
      ))}
    </View>
  );
}
