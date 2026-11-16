import { Button } from '@/src/common/components';
import Icon, { type IconName } from '@/src/common/components/Icon';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Tint } from './utils/tint';

// A pill-style selectable chip: a colored icon/logo bubble plus a label.
// Shared by the claim-type selector and the platform picker so they match.
export function SelectChip({
  title,
  icon,
  tint,
  onPress,
}: {
  title: string;
  icon: IconName | ((props: { size: number; color: string }) => ReactNode);
  tint: Tint;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const { fg, bg } = tint[theme.scheme];

  return (
    <Button
      title={title}
      icon={() => (
        <View
          style={[
            Atoms.rounded_full,
            Atoms.p_sm,
            Atoms.mr_xs,
            { backgroundColor: bg },
          ]}
        >
          {typeof icon === 'function' ? (
            icon({ size: 16, color: fg })
          ) : (
            <Icon name={icon} customColor={fg} />
          )}
        </View>
      )}
      variant="tertiary"
      style={({ hovered }) => [
        hovered
          ? theme.atoms.box.secondary.bg_hover
          : theme.atoms.box.secondary.bg,
        theme.atoms.box.secondary.border,
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
