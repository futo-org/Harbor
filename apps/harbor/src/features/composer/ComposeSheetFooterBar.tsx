import { AttachImageButtons } from '@/src/common/components/composites/AttachImageButtons';
import { CharCount } from '@/src/common/components/composites/CharCount';
import { Kbd, Text } from '@/src/common/components/primitives';
import { useKeyboardOffset } from '@/src/common/lib/animation';
import { Atoms, useTheme } from '@/src/common/theme';
import { hasPointerHover, isApplePlatform } from '@/src/common/util/platform';
import { View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_POST_LENGTH } from './hooks/useComposer';
import { useIsTutorialHintShown } from '@/src/common/lib/useTutorialHintsStore';

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

  const leading = (
    <View style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_sm]}>
      <AttachImageButtons
        onAttachImage={onAttachImage}
        onCaptureImage={onCaptureImage}
        disabled={attachDisabled}
      />
      <CharCount count={charCount} max={MAX_POST_LENGTH} />
    </View>
  );

  const surface = [
    theme.atoms.box.primary.bg,
    theme.atoms.box.primary.border,
    Atoms.border_t,
  ];

  if (variant === 'web') {
    return (
      <View
        style={[
          Atoms.flex_row,
          Atoms.justify_between,
          Atoms.items_center,
          Atoms.py_md,
          Atoms.px_lg,
          surface,
        ]}
      >
        {leading}
        <PostShortcutHint />
      </View>
    );
  }

  return (
    <View style={surface}>
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

function PostShortcutHint() {
  const isHintShown = useIsTutorialHintShown('kbSubmitPost');
  if (!hasPointerHover || !isHintShown) return null;

  return (
    <View style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_xs]}>
      {(isApplePlatform ? ['⌘', '⏎'] : ['Ctrl', 'Enter']).map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
      <Text variant="small" color="muted">
        to post
      </Text>
    </View>
  );
}
