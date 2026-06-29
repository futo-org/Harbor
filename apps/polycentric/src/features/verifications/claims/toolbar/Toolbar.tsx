import { Atoms } from '@/src/common/theme';
import { View } from 'react-native';
import { CLAIM_TYPES } from '../../utils/forms';
import { ClaimTypeChip } from './ClaimTypeChip';
import { IdentityChip } from './IdentityChip';
import { TimeChip } from './TimeChip';

// A row of claim metadata chips: author identity, creation date, and type.
export function Toolbar({
  identity,
  createdAt,
  schemaName,
}: {
  identity: string;
  createdAt: bigint;
  schemaName: string;
}) {
  const claimType = CLAIM_TYPES.find((t) => t.name === schemaName);

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
        name={schemaName}
        icon={claimType?.icon ?? 'verify'}
        color={claimType?.color}
      />
    </View>
  );
}
