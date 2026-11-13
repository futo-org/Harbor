import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import Icon from '@/src/common/components/Icon';
import { router } from 'expo-router';
import { Pressable } from 'react-native';

export function TopbarSettingsButton() {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => router.navigate({ pathname: '/settings' })}
      style={({ pressed }) => [
        Atoms.p_xs,
        Atoms.rounded_full,
        pressed && theme.atoms_new.box.primary.bg_hover,
      ]}
      hitSlop={Spacing['lg']}
    >
      <Icon name="settings" size={20} color="primary" />
    </Pressable>
  );
}
