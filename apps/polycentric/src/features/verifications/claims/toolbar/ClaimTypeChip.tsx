import { Text } from '@/src/common/components';
import { IconName } from '@/src/common/components/Icon';
import { Atoms, PaletteColorToken } from '@/src/common/theme';
import { Chip } from './Chip';
import { ChipIcon } from './ChipIcon';

export function ClaimTypeChip({
  name,
  icon,
  color,
}: {
  name: string;
  icon: IconName;
  color?: PaletteColorToken;
}) {
  return (
    <Chip style={Atoms.pl_xs}>
      <ChipIcon name={icon} color={color} />
      <Text
        variant="small"
        color="neutral_700"
        fontWeight="semibold"
        selectable={false}
      >
        {name}
      </Text>
    </Chip>
  );
}
