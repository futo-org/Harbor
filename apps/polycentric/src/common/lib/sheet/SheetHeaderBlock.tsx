import { Box } from '@/src/common/components/layouts';
import { Text } from '@/src/common/components/primitives';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

export type SheetHeaderBlockProps = {
  title: string;
  onClose: () => void;
  closeDisabled?: boolean;
  trailing?: ReactNode;
};

export function SheetHeaderBlock({
  title,
  onClose,
  closeDisabled = false,
  trailing,
}: SheetHeaderBlockProps) {
  const { theme } = useTheme();

  const iconColor = closeDisabled
    ? theme.palette.neutral_500
    : theme.palette.neutral_1000;

  const right = trailing ?? <View style={{ width: 40, height: 40 }} />;

  return (
    <Box style={Atoms.flex_shrink_0}>
      <Box
        style={[
          Atoms.flex_row,
          Atoms.justify_between,
          Atoms.items_center,
          Atoms.py_md,
          Atoms.px_lg,
          theme.atoms.bg,
          {
            borderBottomWidth: 1,
            borderBottomColor: withHexOpacity(theme.palette.neutral_500, '20'),
            minHeight: 56,
          },
        ]}
      >
        <Pressable
          onPress={onClose}
          disabled={closeDisabled}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={{
            width: 40,
            height: 40,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Ionicons name="close" size={24} color={iconColor} />
        </Pressable>
        <Text
          variant="body"
          fontWeight="semibold"
          style={[theme.atoms.text, { flex: 1, textAlign: 'center' }]}
        >
          {title}
        </Text>
        <Box
          style={{
            minWidth: 40,
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          {right}
        </Box>
      </Box>
    </Box>
  );
}
