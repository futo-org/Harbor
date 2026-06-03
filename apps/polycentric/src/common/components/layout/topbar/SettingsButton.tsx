import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import Icon from '@/src/common/components/Icon';
import { router } from 'expo-router';
import { Pressable } from 'react-native';

export function TopbarSettingsButton() {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/settings' })}
      style={({ pressed }) => [
        Atoms.p_xs,
        Atoms.rounded_full,
        pressed && { backgroundColor: theme.palette.neutral_25 },
      ]}
      hitSlop={Spacing['lg']}
    >
      <Icon name="settings" size={20} color="neutral_800" />
    </Pressable>
  );
}
