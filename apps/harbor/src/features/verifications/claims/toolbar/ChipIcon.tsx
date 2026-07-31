import Icon, { type IconName } from '@/src/common/components/Icon';
import {
  Atoms,
  type PaletteColorToken,
  useTheme,
  withHexOpacity,
} from '@/src/common/theme';
import type { ReactNode } from 'react';
import { View } from 'react-native';

export function ChipIcon({
  name,
  render,
  color = 'neutral_600',
}: {
  name: IconName;
  // Custom glyph (e.g. a platform's brand logo) rendered instead of `name`.
  render?: (props: { size: number; color: string }) => ReactNode;
  color?: PaletteColorToken;
}) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        Atoms.rounded_full,
        Atoms.p_xs,
        { backgroundColor: withHexOpacity(theme.palette[color], '25') },
      ]}
    >
      {render ? (
        render({ size: 12, color: theme.palette[color] })
      ) : (
        <Icon name={name} color={color} size={12} />
      )}
    </View>
  );
}
