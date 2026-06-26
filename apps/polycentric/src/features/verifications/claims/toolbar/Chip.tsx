import { Atoms, useTheme } from '@/src/common/theme';
import { ReactNode } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

// Shared pill container for toolbar chips (non-interactive). Plain content
// gets a roomier left pad; chips with a round leading element pass `pl_xs`.
export function Chip({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.gap_sm,
        Atoms.rounded_full,
        Atoms.pt_xs,
        Atoms.pb_xs,
        Atoms.pl_md,
        Atoms.pr_md,
        { borderWidth: 1, borderColor: theme.palette.neutral_25 },
        style,
      ]}
    >
      {children}
    </View>
  );
}
