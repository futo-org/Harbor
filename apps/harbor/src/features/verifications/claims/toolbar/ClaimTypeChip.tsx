import { Text } from '@/src/common/components';
import type { IconName } from '@/src/common/components/Icon';
import { Atoms, useTheme } from '@/src/common/theme';
import type { ReactNode } from 'react';
import type { Tint } from '../../utils/tint';
import { Chip } from './Chip';
import { ChipIcon } from './ChipIcon';

export function ClaimTypeChip({
  name,
  value,
  icon,
  logo,
  tint,
}: {
  name?: string;
  // Shown after the name, as "<name>: <value>".
  value?: string;
  icon: IconName;
  // Brand logo (e.g. a Platform claim's platform) shown instead of `icon`.
  logo?: (props: { size: number; color: string }) => ReactNode;
  tint?: Tint;
}) {
  const { theme } = useTheme();
  return (
    <Chip style={Atoms.pl_xs}>
      <ChipIcon name={icon} render={logo} tint={tint?.[theme.scheme]} />
      <Text
        variant="small"
        color="secondary"
        fontWeight="semibold"
        numberOfLines={1}
        selectable={false}
        style={Atoms.flex_shrink_1}
      >
        {name}
        {name && value ? ': ' : null}
        {value ? (
          <Text variant="small" color="muted">
            {value}
          </Text>
        ) : null}
      </Text>
    </Chip>
  );
}
