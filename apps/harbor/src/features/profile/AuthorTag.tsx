import { IdentityTag } from '@/src/common/components/primitives/PillChip';
import { Text } from '@/src/common/components/primitives/Text';
import { Block, useShimmerOpacity } from '@/src/common/components/skeletons';
import { Atoms, typography, useTheme } from '@/src/common/theme';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { VerifiedPlatformAccount } from '../verifications/hooks/useVerifiedPlatformAccounts';
import { useKnownAs } from './hooks/useKnownAs';

export function AuthorTag({ identity }: { identity: string }) {
  const { knownAs, isLoading } = useKnownAs(identity);

  if (isLoading) return <AuthorTagSkeleton />;

  return <AuthorTagView identity={identity} knownAs={knownAs} />;
}

export function AuthorTagView({
  identity,
  knownAs,
}: {
  identity: string;
  knownAs: VerifiedPlatformAccount | null;
}) {
  const { theme } = useTheme();

  if (!knownAs) return <IdentityTag identity={identity} />;

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.gap_2xs,
        Atoms.flex_shrink_1,
      ]}
    >
      {knownAs.platform.logo({
        size: typography.fontSize.xs,
        color: theme.palette[knownAs.platform.color],
      })}
      <Text
        variant="secondary"
        color="neutral_500"
        numberOfLines={1}
        style={[Atoms.flex_shrink_1]}
      >
        {knownAs.account}
      </Text>
    </View>
  );
}

function AuthorTagSkeleton() {
  const animatedStyle = useShimmerOpacity();

  return (
    <Animated.View style={animatedStyle}>
      <Block width={80} />
    </Animated.View>
  );
}
