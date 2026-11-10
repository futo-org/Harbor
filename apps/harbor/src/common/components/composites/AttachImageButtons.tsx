import Icon from '@/src/common/components/Icon';
import { Atoms, createThemedStyles } from '@/src/common/theme';
import { Pressable, View } from 'react-native';

/**
 * The "attach image" and "take photo" buttons. Each one is hidden when its
 * handler is omitted.
 */
export function AttachImageButtons({
  onAttachImage,
  onCaptureImage,
  disabled = false,
}: {
  onAttachImage?: () => void;
  onCaptureImage?: () => void;
  disabled?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      {onAttachImage && (
        <Pressable
          onPress={onAttachImage}
          disabled={disabled}
          hitSlop={10}
          accessibilityLabel="Attach image"
          style={[styles.button, disabled && styles.buttonDisabled]}
        >
          <Icon name="image" size={22} color="neutral_700" />
        </Pressable>
      )}
      {onCaptureImage && (
        <Pressable
          onPress={onCaptureImage}
          disabled={disabled}
          hitSlop={10}
          accessibilityLabel="Take photo"
          style={[styles.button, disabled && styles.buttonDisabled]}
        >
          <Icon name="camera" size={22} color="neutral_700" />
        </Pressable>
      )}
    </View>
  );
}

const useStyles = createThemedStyles((_theme, define) =>
  define({
    row: [Atoms.flex_row, Atoms.items_center, Atoms.gap_sm],
    button: [Atoms.p_xs, Atoms.rounded_md],
    buttonDisabled: { opacity: 0.4 },
  }),
);
