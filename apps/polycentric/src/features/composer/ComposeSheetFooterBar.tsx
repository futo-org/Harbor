import Icon from '@/src/common/components/Icon';
import { Text } from '@/src/common/components/primitives';
import { useKeyboardOffset } from '@/src/common/lib/animation';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { Pressable, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type ComposeSheetFooterBarProps = {
  charCount: number;
  submitting: boolean;
  canPost: boolean;
  onPost: () => void;
  /** Optional hook for the "attach image" button. Button is hidden when omitted. */
  onAttachImage?: () => void;
  /** Optional hook for the "take photo" button (mobile). Hidden when omitted. */
  onCaptureImage?: () => void;
  attachDisabled?: boolean;
  variant: 'native' | 'web';
};

export function ComposeSheetFooterBar({
  charCount,
  onAttachImage,
  onCaptureImage,
  attachDisabled = false,
  variant,
}: ComposeSheetFooterBarProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { keyboardHeight } = useKeyboardOffset();

  // Pad the bar by the bottom safe-area inset while the keyboard is closed;
  // once the keyboard opens it provides the spacing instead.
  const bottomInsetStyle = useAnimatedStyle(() => ({
    height: interpolate(
      keyboardHeight.value,
      [0, insets.bottom],
      [insets.bottom, 0],
      Extrapolation.CLAMP,
    ),
  }));

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

  const captureButton = onCaptureImage ? (
    <Pressable
      onPress={onCaptureImage}
      disabled={attachDisabled}
      hitSlop={10}
      accessibilityLabel="Take photo"
      style={[
        Atoms.p_xs,
        Atoms.rounded_md,
        { opacity: attachDisabled ? 0.4 : 1 },
      ]}
    >
      <Icon name="camera" size={22} color="neutral_700" />
    </Pressable>
  ) : null;

  const leading = (
    <View style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_sm]}>
      {attachButton}
      {captureButton}
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
    <View style={[theme.atoms.bg, borderTop]}>
      <View
        style={[
          Atoms.flex_row,
          Atoms.justify_between,
          Atoms.items_center,
          Atoms.py_md,
          Atoms.px_lg,
        ]}
      >
        {leading}
      </View>
      <Animated.View style={bottomInsetStyle} />
    </View>
  );
}
