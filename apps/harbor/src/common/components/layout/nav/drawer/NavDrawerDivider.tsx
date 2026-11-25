import { Spacing, useTheme } from '@/src/common/theme';
import { StyleSheet, View } from 'react-native';

export function NavDrawerDivider() {
  const { theme } = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        marginHorizontal: -Spacing.md,
        backgroundColor: theme.colors.box.primary.border,
      }}
    />
  );
}
