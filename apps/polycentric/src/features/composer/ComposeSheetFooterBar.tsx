import { Box } from '@/src/common/components/layouts';
import { Button, Text } from '@/src/common/components/primitives';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { ActivityIndicator } from 'react-native';

export type ComposeSheetFooterBarProps = {
  charCount: number;
  submitting: boolean;
  canPost: boolean;
  onPost: () => void;
  variant: 'native' | 'web';
};

export function ComposeSheetFooterBar({
  charCount,
  submitting,
  canPost,
  onPost,
  variant,
}: ComposeSheetFooterBarProps) {
  const { theme } = useTheme();

  const countLabel = (
    <Text variant="small" color="neutral_500">
      {charCount}/2000
    </Text>
  );

  const postSlot = (
    <Box
      style={{
        minWidth: 80,
        minHeight: 36,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {submitting ? (
        <ActivityIndicator
          size="small"
          color={theme.palette.primary_500}
          accessibilityLabel="Posting"
        />
      ) : (
        <Button
          title="Post"
          onPress={onPost}
          variant={canPost ? 'primary' : 'disabled'}
          size="sm"
        />
      )}
    </Box>
  );

  const borderTop = {
    borderTopWidth: 1,
    borderTopColor: withHexOpacity(theme.palette.neutral_500, '20'),
  } as const;

  if (variant === 'web') {
    return (
      <Box
        style={[
          Atoms.flex_row,
          Atoms.justify_between,
          Atoms.items_center,
          Atoms.py_md,
          Atoms.px_lg,
          theme.atoms.bg,
          borderTop,
          { paddingBottom: 24 },
        ]}
      >
        {countLabel}
        {postSlot}
      </Box>
    );
  }

  return (
    <Box
      style={[
        Atoms.flex_row,
        Atoms.justify_end,
        Atoms.py_md,
        Atoms.px_lg,
        theme.atoms.bg,
        borderTop,
        { paddingBottom: 24 },
      ]}
    >
      {countLabel}
    </Box>
  );
}
