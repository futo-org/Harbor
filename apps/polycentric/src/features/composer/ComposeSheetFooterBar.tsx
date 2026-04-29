import { Button, Text } from '@/src/common/components/primitives';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { ActivityIndicator, View } from 'react-native';

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
    <View
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
          variant="primary"
          disabled={!canPost}
          size="sm"
        />
      )}
    </View>
  );

  const borderTop = {
    borderTopWidth: 1,
    borderTopColor: withHexOpacity(theme.palette.neutral_500, '20'),
  } as const;

  if (variant === 'web') {
    return (
      <View
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
      </View>
    );
  }

  return (
    <View
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
    </View>
  );
}
