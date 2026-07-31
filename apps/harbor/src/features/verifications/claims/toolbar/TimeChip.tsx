import { Text } from '@/src/common/components';
import { Atoms } from '@/src/common/theme';
import { Chip } from './Chip';
import { ChipIcon } from './ChipIcon';

export function TimeChip({ createdAt }: { createdAt: bigint }) {
  const date = new Date(Number(createdAt)).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Chip style={Atoms.pl_xs}>
      <ChipIcon name="time" />
      <Text
        variant="small"
        color="neutral_700"
        fontWeight="semibold"
        selectable={false}
      >
        {date}
      </Text>
    </Chip>
  );
}
