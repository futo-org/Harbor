import { Text } from '@/src/common/components';
import { Routes } from '@/src/common/constants';
import { Atoms, useTheme } from '@/src/common/theme';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { DecodedClaim } from '../hooks/useClaimById';
import { CLAIM_TYPES } from '../utils/forms';
import { resolveClaimTitle } from '../utils/render';
import { ClaimTypeChip } from './toolbar/ClaimTypeChip';
import { TimeChip } from './toolbar/TimeChip';

// A single claim in the list: title plus the type and time chips, linking to
// the claim's view.
export function ClaimListItem({ claim }: { claim: DecodedClaim }) {
  const { theme } = useTheme();
  const { title } = resolveClaimTitle(claim.schemaName, claim.fields);
  const claimType = CLAIM_TYPES.find((t) => t.name === claim.schemaName);

  return (
    <Pressable
      onPress={() =>
        router.push(
          Routes.tabs.verification(
            claim.identity,
            claim.keyFingerprint,
            claim.sequence.toString(),
          ),
        )
      }
      style={({ hovered, pressed }) => [
        (hovered || pressed) && {
          backgroundColor: theme.palette.neutral_25,
        },
      ]}
    >
      <View
        style={[
          // Atoms.flex_row,
          // Atoms.flex_wrap,
          Atoms.gap_sm,
          Atoms.pl_lg,
          Atoms.pr_lg,
          Atoms.pt_md,
          Atoms.pb_md,
          Atoms.rounded_md,
          { borderBottomWidth: 1, borderColor: theme.palette.neutral_25 },
        ]}
      >
        <Text
          variant="secondary"
          fontWeight="semibold"
          style={theme.atoms.text}
          selectable={false}
        >
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
            name={claim.schemaName}
            icon={claimType?.icon ?? 'verify'}
            color={claimType?.color}
          />
          <TimeChip createdAt={claim.createdAt} />
        </View>
      </View>
    </Pressable>
  );
}
