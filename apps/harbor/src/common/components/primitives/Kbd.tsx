import { Atoms, useTheme } from '@/src/common/theme';
import { View } from 'react-native';
import { Text } from './Text';

// Lowercase-heavy labels make a centered box look slightly too high
const KEY_BOX_DROP = 0.5;

interface KbdProps {
  children: string;
}

/** A single keyboard key drawn as a small keycap, e.g. in shortcut hints. */
export function Kbd({ children }: KbdProps) {
  const { theme } = useTheme();
  const isWord = children.length > 1;

  return (
    <View
      style={[
        Atoms.px_xs,
        Atoms.rounded_sm,
        theme.atoms.bg_neutral_25,
        theme.atoms.border_neutral_medium,
        { borderWidth: 1, transform: [{ translateY: KEY_BOX_DROP }] },
      ]}
    >
      <Text
        variant="small"
        color="neutral_500"
        // Words stay on the neighboring text's baseline; single glyphs
        // (⌘, ⏎, ↑) have no baseline to keep and move with the box.
        style={isWord && { transform: [{ translateY: -KEY_BOX_DROP }] }}
      >
        {children}
      </Text>
    </View>
  );
}
