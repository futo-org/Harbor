import { Block, useShimmerOpacity } from '@/src/common/components/skeletons';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import {
  COMPACT_IMAGE_WIDTH,
  LinkPreviewCard,
} from '@/src/features/post/content/LinkPreviewCard';
import type { v2 } from '@polycentric/react-native';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text } from '@/src/common/components/primitives';
import { commentCountLabel } from './hooks/useAnywhereCommentCount';

/** The page the posts below are about. */
export function AnywhereCard({
  link,
  loading,
  compact,
  commentCount,
}: {
  link: v2.Link;
  /** How many comments the page has, shown under the card once known. */
  commentCount?: number;
  /** Stands in for the card while what it shows is being fetched. */
  loading?: boolean;
  /** For narrow views: the image beside the text, not over it. */
  compact?: boolean;
}) {
  return (
    <View style={[Atoms.px_md, Atoms.pb_md]}>
      {loading ? (
        <AnywhereCardSkeleton compact={compact} />
      ) : (
        <LinkPreviewCard link={link} compact={compact} />
      )}
      {commentCount === undefined ? null : (
        <Text variant="secondary" color="neutral_500" style={Atoms.mt_md}>
          {commentCountLabel(commentCount)}
        </Text>
      )}
    </View>
  );
}

function AnywhereCardSkeleton({ compact }: { compact?: boolean }) {
  const { theme } = useTheme();
  const animatedStyle = useShimmerOpacity();
  const image = withHexOpacity(theme.palette.neutral_500, '20');

  return (
    <Animated.View
      accessibilityLabel="Loading page details"
      style={[
        Atoms.rounded_md,
        Atoms.mt_md,
        Atoms.overflow_hidden,
        compact && Atoms.flex_row,
        animatedStyle,
        {
          borderWidth: 1,
          borderColor: withHexOpacity(theme.palette.neutral_500, '30'),
        },
      ]}
    >
      {compact ? null : (
        <View
          style={[Atoms.w_full, { aspectRatio: 1.91, backgroundColor: image }]}
        />
      )}
      <View style={[Atoms.p_md, Atoms.gap_sm, compact && Atoms.flex_1]}>
        <Block width={96} />
        <Block width="80%" />
        <Block width="100%" />
        <Block width="60%" />
      </View>
      {compact ? (
        <View style={{ width: COMPACT_IMAGE_WIDTH, backgroundColor: image }} />
      ) : null}
    </Animated.View>
  );
}
