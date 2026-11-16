import { Text } from '@/src/common/components';
import { Atoms, useTheme } from '@/src/common/theme';
import { Chip } from './Chip';
import { ChipIcon } from './ChipIcon';

export function StatusChip({
  verifiedCount = 0,
  totalCount = 0,
}: {
  verifiedCount?: number;
  totalCount?: number;
}) {
  const { theme } = useTheme();
  const verified = verifiedCount > 0;
  return (
    <Chip style={Atoms.pl_xs}>
      <ChipIcon
        name={verified ? 'verify' : 'close'}
        tint={
          verified
            ? {
                fg: theme.colors.success,
                bg: theme.colors.box.success.bg_subtle,
              }
            : undefined
        }
      />
      <Text
        variant="small"
        color="secondary"
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
