import { Button } from '@/src/common/components';
import Icon, { type IconName } from '@/src/common/components/Icon';
import {
  Atoms,
  type PaletteColorToken,
  Spacing,
  useTheme,
  withHexOpacity,
} from '@/src/common/theme';
import type { ReactNode } from 'react';
import { View } from 'react-native';

// A pill-style selectable chip: a colored icon/logo bubble plus a label.
// Shared by the claim-type selector and the platform picker so they match.
export function SelectChip({
  title,
  icon,
  color,
  onPress,
}: {
  title: string;
  icon: IconName | ((props: { size: number; color: string }) => ReactNode);
  color?: PaletteColorToken;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const tint = color ? theme.palette[color] : theme.palette.neutral_1000;

  return (
    <Button
      title={title}
      icon={() => (
        <View
          style={[
            Atoms.rounded_full,
            Atoms.p_sm,
            Atoms.mr_xs,
            { backgroundColor: withHexOpacity(tint, '25') },
          ]}
        >
          {typeof icon === 'function' ? (
            icon({ size: 16, color: tint })
          ) : (
            <Icon name={icon} customColor={tint} />
          )}
        </View>
      )}
      variant="tertiary"
      style={[
        theme.atoms_new.box.secondary.bg,
        theme.atoms_new.box.secondary.border,
        {
          paddingVertical: Spacing.sm,
          paddingHorizontal: Spacing.md,
          paddingRight: Spacing.xl,
        },
      ]}
      size="md"
      onPress={onPress}
    />
  );
}
