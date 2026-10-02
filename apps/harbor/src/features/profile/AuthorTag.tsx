import { IdentityTag } from '@/src/common/components/primitives/PillChip';
import { Text, VARIANT_CONFIG } from '@/src/common/components/primitives/Text';
import { Block, useShimmerOpacity } from '@/src/common/components/skeletons';
import { Atoms, typography, useTheme } from '@/src/common/theme';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { VerifiedPlatformAccount } from '../verifications/hooks/useVerifiedPlatformAccounts';
import { useKnownAs } from './hooks/useKnownAs';

type AuthorTagVariant = 'secondary' | 'small';

export function AuthorTag({
  identity,
  variant = 'secondary',
}: {
  identity: string;
  variant?: AuthorTagVariant;
}) {
  const { knownAs, alias, isLoading } = useKnownAs(identity);

  if (isLoading && !knownAs) return <AuthorTagSkeleton variant={variant} />;

  return (
    <AuthorTagView
      identity={identity}
      knownAs={knownAs}
      alias={alias}
      variant={variant}
    />
  );
}

export function AuthorTagView({
  identity,
  knownAs,
  alias,
  variant = 'secondary',
}: {
  identity: string;
  knownAs: VerifiedPlatformAccount | null;
  alias: string | null;
  variant?: AuthorTagVariant;
}) {
  if (!knownAs && alias) {
    return (
      <Text
        variant={variant}
        color="neutral_500"
        numberOfLines={1}
        style={[Atoms.flex_shrink_1]}
      >
        {alias}
      </Text>
    );
  }

  if (!knownAs) return <IdentityTag identity={identity} variant={variant} />;

  return <KnownAsLabel knownAs={knownAs} variant={variant} />;
}

export function KnownAsLabel({
  knownAs,
  variant = 'secondary',
}: {
  knownAs: VerifiedPlatformAccount;
  variant?: AuthorTagVariant;
}) {
  const { theme } = useTheme();

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
        variant={variant}
        color="neutral_500"
        numberOfLines={1}
        style={[Atoms.flex_shrink_1]}
      >
        {knownAs.account}
      </Text>
    </View>
  );
}

function AuthorTagSkeleton({ variant }: { variant: AuthorTagVariant }) {
  const animatedStyle = useShimmerOpacity();

  return (
    <Animated.View
      style={[
        animatedStyle,
        Atoms.justify_center,
        // Take the text's line height, so the row doesn't resize once it resolves.
        { height: typography.lineHeight[VARIANT_CONFIG[variant].size] },
      ]}
    >
      <Block width={80} />
    </Animated.View>
  );
}
