import { Box } from '@/src/common/components/layouts';
import { IconButton, Text } from '@/src/common/components/primitives';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { View } from 'react-native';

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
        <IconButton
          icon={(p) => <Ionicons name="close" {...p} />}
          onPress={onClose}
          disabled={closeDisabled}
          iconColor={closeDisabled ? 'neutral_500' : 'neutral_1000'}
          variant="filled"
          size="md"
        />
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
