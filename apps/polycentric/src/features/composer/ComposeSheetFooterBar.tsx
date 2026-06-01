import Icon from '@/src/common/components/Icon';
import { Text } from '@/src/common/components/primitives';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { Pressable, View } from 'react-native';

export type ComposeSheetFooterBarProps = {
  charCount: number;
  submitting: boolean;
  canPost: boolean;
  onPost: () => void;
  /** Optional hook for the "attach image" button. Button is hidden when omitted. */
  onAttachImage?: () => void;
  attachDisabled?: boolean;
  variant: 'native' | 'web';
};

export function ComposeSheetFooterBar({
  charCount,
  submitting,
  canPost,
  onPost,
  onAttachImage,
  attachDisabled = false,
  variant,
}: ComposeSheetFooterBarProps) {
  const { theme } = useTheme();

  const attachButton = onAttachImage ? (
    <Pressable
      onPress={onAttachImage}
      disabled={attachDisabled}
      hitSlop={10}
      accessibilityLabel="Attach image"
      style={[
        Atoms.p_xs,
        Atoms.rounded_md,
        { opacity: attachDisabled ? 0.4 : 1 },
      ]}
    >
      <Icon name="image" size={22} color="neutral_700" />
    </Pressable>
  ) : null;

  const leading = (
    <View style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_sm]}>
      {attachButton}
      <Text variant="small" color="neutral_500">
        {charCount}/2000
      </Text>
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
        ]}
      >
        {leading}
      </View>
    );
  }

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
      ]}
    >
      {leading}
    </View>
  );
}
