import {
  AVATAR_SIZE,
  Block,
  SkeletonList,
  useShimmerOpacity,
} from '@/src/common/components/skeletons';
import { Atoms } from '@/src/common/theme';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

/**
 * Placeholder shaped like a `ProfileRow` and a trailing reaction.
 */
export function ReactionRowSkeleton() {
  const animatedStyle = useShimmerOpacity();

  return (
    <Animated.View
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.gap_md,
        Atoms.px_lg,
        Atoms.py_md,
        animatedStyle,
      ]}
    >
      <Block width={AVATAR_SIZE} height={AVATAR_SIZE} />
      <View style={[Atoms.flex_1, Atoms.gap_sm]}>
        <Block width={120} />
        <Block width={80} height={10} />
      </View>
      <Block width={18} height={18} radius={4} />
    </Animated.View>
  );
}

export function ReactionRowSkeletonList({ count }: { count: number }) {
  return (
    <SkeletonList count={count}>
      <ReactionRowSkeleton />
    </SkeletonList>
  );
}
