import { Atoms } from '@/src/common/theme';
import { View } from 'react-native';
import type { ClaimField } from '../../hooks/useClaimById';
import { CLAIM_TYPES } from '../../utils/forms';
import { getPlatformFromClaim } from '../../utils/platforms';
import { ClaimTypeChip } from './ClaimTypeChip';
import { IdentityChip } from './IdentityChip';
import { TimeChip } from './TimeChip';

// A row of claim metadata chips: author identity, creation date, and type.
export function Toolbar({
  identity,
  createdAt,
  schemaName,
  fields = [],
}: {
  identity: string;
  createdAt: bigint;
  schemaName: string;
  fields?: ClaimField[];
}) {
  const claimType = CLAIM_TYPES.find((t) => t.name === schemaName);
  // Platform claims chip as their platform (brand logo + name).
  const platform = getPlatformFromClaim(schemaName, fields);

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.gap_sm,
        Atoms.flex_wrap,
      ]}
    >
      <IdentityChip identity={identity} />
      <TimeChip createdAt={createdAt} />
      <ClaimTypeChip
        name={platform?.name ?? schemaName}
        icon={claimType?.icon ?? 'verify'}
        logo={platform?.logo}
        color={platform?.color ?? claimType?.color}
      />
    </View>
  );
}
