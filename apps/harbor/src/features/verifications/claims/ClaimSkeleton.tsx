import {
  Block,
  SkeletonList,
  useShimmerOpacity,
} from '@/src/common/components/skeletons';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

/** Placeholder for a `ClaimListItem`: a title bar and a row of chips. */
export function ClaimSkeleton() {
  const { theme } = useTheme();
  const animatedStyle = useShimmerOpacity();

  return (
    <Animated.View
      style={[
        Atoms.gap_sm,
        Atoms.px_lg,
        Atoms.py_md,
        animatedStyle,
        {
          borderBottomWidth: 1,
          borderBottomColor: withHexOpacity(theme.palette.neutral_500, '20'),
        },
      ]}
    >
      <Block width={180} />
      <View style={[Atoms.flex_row, Atoms.gap_sm]}>
        <Block width={72} height={24} />
        <Block width={56} height={24} />
      </View>
    </Animated.View>
  );
}

export function ClaimSkeletonList({ count = 4 }: { count?: number }) {
  return (
    <SkeletonList count={count}>
      <ClaimSkeleton />
    </SkeletonList>
  );
}
