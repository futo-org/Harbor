import { Text } from '@/src/common/components';
import { Routes } from '@/src/common/constants';
import { Atoms, useTheme } from '@/src/common/theme';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import type { DecodedClaim } from '../hooks/useClaimById';
import type { ClaimVerificationStatus } from '../utils/claim-status';
import { CLAIM_TYPES } from '../utils/forms';
import { getPlatformFromClaim } from '../utils/platforms';
import { resolveClaimTitle } from '../utils/render';
import { ClaimAuthorLine } from './ClaimAuthorLine';
import { ClaimMenu } from './ClaimMenu';
import { ClaimTypeChip } from './toolbar/ClaimTypeChip';
import { StatusChip } from './toolbar/StatusChip';

export function ClaimListItem({
  claim,
  onPress,
}: {
  claim: DecodedClaim & { status?: ClaimVerificationStatus };
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  const { title } = resolveClaimTitle(claim.schemaName, claim.fields);
  const claimType = CLAIM_TYPES.find((t) => t.name === claim.schemaName);
  // Platform claims chip as their platform (brand logo + name).
  const platform = getPlatformFromClaim(claim.schemaName, claim.fields);

  return (
    <Pressable
      onPress={
        onPress ??
        (() =>
          router.push(
            Routes.tabs.verification(
              claim.identity,
              claim.keyFingerprint,
              claim.sequence.toString(),
            ),
          ))
      }
      style={({ hovered, pressed }) => [
        (hovered || pressed) && {
          backgroundColor: theme.palette.neutral_25,
        },
      ]}
    >
      <View
        style={[
          Atoms.gap_sm,
          Atoms.px_lg,
          Atoms.py_md,
          { borderBottomWidth: 1, borderColor: theme.palette.neutral_25 },
        ]}
      >
        <View style={[Atoms.flex_row, Atoms.align_center, Atoms.gap_sm]}>
          <View style={Atoms.flex_1}>
            <ClaimAuthorLine
              identity={claim.identity}
              createdAt={claim.createdAt}
            />
          </View>
          <ClaimMenu claim={claim} icon="more" iconSize={16} />
        </View>
        <Text variant="body" style={theme.atoms.text} selectable={false}>
          {title}
        </Text>
        <View
          style={[
            Atoms.flex_row,
            Atoms.align_center,
            Atoms.gap_sm,
            Atoms.flex_wrap,
          ]}
        >
          <ClaimTypeChip
            name={platform?.name ?? claim.schemaName}
            icon={claimType?.icon ?? 'verify'}
            logo={platform?.logo}
            color={platform?.color ?? claimType?.color}
          />
          <StatusChip
            verifiedCount={claim.status?.verifiedCount}
            totalCount={claim.status?.totalCount}
          />
        </View>
      </View>
    </Pressable>
  );
}
