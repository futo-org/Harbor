import { useWebHover } from '@/src/common/lib/useWebHover';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import type { ReactNode } from 'react';
import { Text } from '@/src/common/components/primitives/Text';
import { ActivityIndicator, Pressable, View } from 'react-native';
import {
  useVerifiedPlatformAccounts,
  type VerifiedPlatformAccount,
} from '../verifications/hooks/useVerifiedPlatformAccounts';
import { AuthorTagView } from './AuthorTag';

export function KnownAsPicker({
  identityKey,
  nameDraft,
  selectedClaimId,
  onSelect,
}: {
  identityKey: string;
  nameDraft: string;
  selectedClaimId: string | null;
  onSelect: (claimId: string | null) => void;
}) {
  const { theme } = useTheme();
  const { verifiedAccounts, isLoading } = useVerifiedPlatformAccounts({
    identity: identityKey,
  });

  if (isLoading && verifiedAccounts.length === 0) {
    return (
      <View style={Atoms.p_md}>
        <ActivityIndicator
          size="small"
          color={theme.palette.primary_500}
          style={Atoms.self_start}
          accessibilityLabel="Loading verified accounts"
        />
      </View>
    );
  }

  return (
    <View style={[Atoms.flex_row, Atoms.flex_wrap, Atoms.gap_xs]}>
      <KnownAsOption
        // A saved claim that was deleted or lost its verification shows as none.
        selected={!verifiedAccounts.some((a) => a.claimId === selectedClaimId)}
        onPress={() => onSelect(null)}
      >
        <AuthorLine identityKey={identityKey} name={nameDraft} knownAs={null} />
      </KnownAsOption>
      {verifiedAccounts.map((account) => (
        <KnownAsOption
          key={account.claimId}
          selected={account.claimId === selectedClaimId}
          onPress={() => onSelect(account.claimId)}
        >
          <AuthorLine
            identityKey={identityKey}
            name={nameDraft}
            knownAs={account}
          />
        </KnownAsOption>
      ))}
    </View>
  );
}

function KnownAsOption({
  selected,
  onPress,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const { hovered, onHoverIn, onHoverOut } = useWebHover();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      style={[
        Atoms.self_start,
        Atoms.rounded_md,
        Atoms.px_sm,
        Atoms.py_xs,
        {
          borderWidth: 1,
          borderColor: selected
            ? withHexOpacity(theme.palette.primary_500, '80')
            : hovered
              ? withHexOpacity(theme.palette.primary_500, '50')
              : theme.palette.neutral_50,
          backgroundColor: selected
            ? withHexOpacity(theme.palette.primary_500, '16')
            : theme.palette.neutral_0,
        },
      ]}
    >
      {children}
    </Pressable>
  );
}

function AuthorLine({
  identityKey,
  name,
  knownAs,
}: {
  identityKey: string;
  name: string;
  knownAs: VerifiedPlatformAccount | null;
}) {
  return (
    <View style={[Atoms.flex_row, Atoms.align_center, Atoms.gap_xs]}>
      <Text
        variant="secondary"
        fontWeight="bold"
        numberOfLines={1}
        style={Atoms.flex_shrink_1}
      >
        {name}
      </Text>
      <AuthorTagView identity={identityKey} knownAs={knownAs} />
    </View>
  );
}
