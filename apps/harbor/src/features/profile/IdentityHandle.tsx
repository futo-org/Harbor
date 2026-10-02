import { IdentityTag } from '@/src/common/components/primitives/PillChip';
import { Text, VARIANT_CONFIG } from '@/src/common/components/primitives/Text';
import { Atoms, typography, useTheme } from '@/src/common/theme';
import { StyleSheet, View } from 'react-native';
import type { VerifiedPlatformAccount } from '../verifications/hooks/useVerifiedPlatformAccounts';
import { useKnownAs } from './hooks/useKnownAs';

type IdentityHandleVariant = 'secondary' | 'small';

export function IdentityHandle({
  identity,
  variant = 'secondary',
}: {
  identity: string;
  variant?: IdentityHandleVariant;
}) {
  const { knownAs, alias, isLoading } = useKnownAs(identity);

  if (isLoading && !knownAs)
    return (
      <View
        // Take the text's line height, so the row doesn't resize once it resolves.
        style={{ height: typography.lineHeight[VARIANT_CONFIG[variant].size] }}
      />
    );

  return (
    <IdentityHandleLabel
      identity={identity}
      knownAs={knownAs}
      alias={alias}
      variant={variant}
    />
  );
}

export function IdentityHandleLabel({
  identity,
  knownAs,
  alias,
  variant = 'secondary',
}: {
  identity: string;
  knownAs: VerifiedPlatformAccount | null;
  alias: string | null;
  variant?: IdentityHandleVariant;
}) {
  if (!knownAs && alias) {
    return (
      <Text
        variant={variant}
        color="neutral_500"
        numberOfLines={1}
        style={styles.handle}
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
  variant?: IdentityHandleVariant;
}) {
  const { theme } = useTheme();

  return (
    <View
      style={[Atoms.flex_row, Atoms.align_center, Atoms.gap_2xs, styles.handle]}
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

const styles = StyleSheet.create({
  handle: {
    // Prioritizes username when both are side-by-side, too long and have to be ellipsized
    flexShrink: 100,
    // Keep something legible when ellipsized
    minWidth: 60,
  },
});
