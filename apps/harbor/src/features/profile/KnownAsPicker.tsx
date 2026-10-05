import { useWebHover } from '@/src/common/lib/useWebHover';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useVerifiedPlatformAccounts } from '../verifications/hooks/useVerifiedPlatformAccounts';
import { IdentityHandleLabel } from './IdentityHandle';

export function KnownAsPicker({
  identityKey,
  aliasDraft,
  selectedClaimId,
  onSelect,
}: {
  identityKey: string;
  aliasDraft: string;
  selectedClaimId: string | null;
  onSelect: (claimId: string | null) => void;
}) {
  const { theme } = useTheme();
  const { verifiedAccounts, isLoading } =
    useVerifiedPlatformAccounts(identityKey);
  // "Other" accounts are arbitrary websites, so they can't be a known-as.
  const knownAsCandidates = verifiedAccounts.filter((a) => !a.platform.generic);

  if (isLoading && knownAsCandidates.length === 0) {
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
        selected={!knownAsCandidates.some((a) => a.claimId === selectedClaimId)}
        onPress={() => onSelect(null)}
      >
        <IdentityHandleLabel
          identity={identityKey}
          knownAs={null}
          alias={aliasDraft.trim() || null}
        />
      </KnownAsOption>
      {knownAsCandidates.map((account) => (
        <KnownAsOption
          key={account.claimId}
          selected={account.claimId === selectedClaimId}
          onPress={() => onSelect(account.claimId)}
        >
          <IdentityHandleLabel
            identity={identityKey}
            knownAs={account}
            alias={null}
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
