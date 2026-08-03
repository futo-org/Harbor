import {
  AVATAR_SIZE,
  Block,
  SkeletonList,
  useShimmerOpacity,
} from '@/src/common/components/skeletons';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

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
      <Block width={AVATAR_SIZE} height={AVATAR_SIZE} />
      <View style={[Atoms.flex_1, Atoms.gap_sm]}>
        <View style={[Atoms.flex_row, Atoms.gap_sm, Atoms.align_center]}>
          <Block width={120} />
          <Block width={60} />
          <Block width={40} />
        </View>
        <Block width="100%" />
        <Block width="80%" />
        <View style={[Atoms.flex_row, Atoms.gap_lg, Atoms.mt_sm]}>
          <Block width={28} height={14} />
          <Block width={28} height={14} />
          <Block width={28} height={14} />
        </View>
      </View>
    </Animated.View>
  );
}

export function PostSkeletonList({ count = 6 }: { count?: number }) {
  return (
    <SkeletonList count={count}>
      <PostSkeleton />
    </SkeletonList>
  );
}
