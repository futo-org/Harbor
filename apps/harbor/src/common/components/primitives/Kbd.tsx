import { Atoms, useTheme } from '@/src/common/theme';
import { View } from 'react-native';
import { Text } from './Text';

interface KbdProps {
  children: string;
}

/** A single keyboard key drawn as a small keycap, e.g. in shortcut hints. */
export function Kbd({ children }: KbdProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        Atoms.px_xs,
        Atoms.rounded_sm,
        theme.atoms.bg_neutral_25,
        theme.atoms.border_neutral_medium,
        { borderWidth: 1 },
      ]}
    >
      <Text variant="small" fontWeight="medium" color="neutral_500">
        {children}
      </Text>
    </View>
  );
}
