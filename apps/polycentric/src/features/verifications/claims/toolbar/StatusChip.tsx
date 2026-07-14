import { Text } from '@/src/common/components';
import { Atoms } from '@/src/common/theme';
import { Chip } from './Chip';
import { ChipIcon } from './ChipIcon';

export function StatusChip({
  verifiedCount = 0,
  totalCount = 0,
}: {
  verifiedCount?: number;
  totalCount?: number;
}) {
  const verified = verifiedCount > 0;
  return (
    <Chip style={Atoms.pl_xs}>
      <ChipIcon
        name={verified ? 'verify' : 'close'}
        color={verified ? 'positive_500' : undefined}
      />
      <Text
        variant="small"
        color="neutral_700"
        fontWeight="semibold"
        selectable={false}
      >
        {totalCount > 0
          ? `${verifiedCount}/${totalCount} verified`
          : 'Not verified'}
      </Text>
    </Chip>
  );
}
