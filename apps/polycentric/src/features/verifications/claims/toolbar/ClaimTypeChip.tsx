import { Text } from '@/src/common/components';
import type { IconName } from '@/src/common/components/Icon';
import { Atoms, type PaletteColorToken } from '@/src/common/theme';
import type { ReactNode } from 'react';
import { Chip } from './Chip';
import { ChipIcon } from './ChipIcon';

export function ClaimTypeChip({
  name,
  icon,
  logo,
  color,
}: {
  name: string;
  icon: IconName;
  // Brand logo (e.g. a Platform claim's platform) shown instead of `icon`.
  logo?: (props: { size: number; color: string }) => ReactNode;
  color?: PaletteColorToken;
}) {
  return (
    <Chip style={Atoms.pl_xs}>
      <ChipIcon name={icon} render={logo} color={color} />
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
