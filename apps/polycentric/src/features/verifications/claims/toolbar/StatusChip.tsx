import { Text } from '@/src/common/components';
import { Atoms } from '@/src/common/theme';
import { Chip } from './Chip';
import { ChipIcon } from './ChipIcon';

export function StatusChip({ verified = false }: { verified?: boolean }) {
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
        {verified ? 'Verified' : 'Not verified'}
      </Text>
    </Chip>
  );
}
