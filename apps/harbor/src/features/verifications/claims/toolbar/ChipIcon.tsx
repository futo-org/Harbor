import Icon, { type IconName } from '@/src/common/components/Icon';
import { Atoms, useTheme } from '@/src/common/theme';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { TintColors } from '../../utils/tint';

export function ChipIcon({
  name,
  render,
  tint,
}: {
  name: IconName;
  // Custom glyph (e.g. a platform's brand logo) rendered instead of `name`.
  render?: (props: { size: number; color: string }) => ReactNode;
  tint?: TintColors;
}) {
  const { theme } = useTheme();
  const { fg, bg } = tint ?? {
    fg: theme.colors.muted,
    bg: theme.colors.box.raised.bg,
  };

  return (
    <View style={[Atoms.rounded_full, Atoms.p_xs, { backgroundColor: bg }]}>
      {render ? (
        render({ size: 12, color: fg })
      ) : (
        <Icon name={name} customColor={fg} size={12} />
      )}
    </View>
  );
}
