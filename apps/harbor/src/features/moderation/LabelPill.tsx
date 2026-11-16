import { Text } from '@/src/common/components/primitives/Text';
import type { PostLabel } from '@/src/common/lib/polycentric-hooks/helpers';
import { moderationLabelName } from '@/src/common/settings/moderationLabels';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { Pressable, View } from 'react-native';
import { isWeb } from '@/src/common/util/platform';
import { useModerationWarningStore } from './useModerationWarningStore';

export function labelNames(labels: PostLabel[]): string {
  return labels.map((label) => moderationLabelName(label.value)).join(', ');
}

/** Labels as a pill, with an optional Show or Hide segment. */
export function LabelPill({
  labels,
  identity = null,
  action,
  onPress,
  inline = false,
}: {
  labels: PostLabel[];
  /** The labelled identity, named in the Show sheet. */
  identity?: string | null;
  action?: 'Show' | 'Hide';
  onPress?: () => void;
  /** Inside a line of text: less vertical padding. */
  inline?: boolean;
}) {
  const { theme } = useTheme();
  const openWarning = useModerationWarningStore((s) => s.openFor);
  // Showing goes through the sheet's confirm; hiding is immediate.
  const handlePress =
    action === 'Show'
      ? () =>
          openWarning({
            labels,
            identity,
            subject: 'profile',
            onConfirm: () => onPress?.(),
          })
      : onPress;
  return (
    <Pressable
      accessibilityRole={action ? 'button' : undefined}
      accessibilityLabel={action}
      onPress={handlePress}
      disabled={!action}
      style={({ pressed }) => [
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.self_start,
        // Nothing to ellipsize once only the Hide segment is left.
        action === 'Hide' ? Atoms.flex_shrink_0 : Atoms.flex_shrink_1,
        Atoms.max_w_full,
        Atoms.rounded_full,
        Atoms.overflow_hidden,
        theme.atoms.box.secondary.bg,
        // Native inline views sit on the baseline; drop to the middle.
        inline && !isWeb && { transform: [{ translateY: Spacing.xs }] },
        pressed && Atoms.faded,
      ]}
    >
      {action === 'Hide' ? null : (
        <View
          style={[
            Atoms.flex_row,
            Atoms.align_center,
            Atoms.gap_xs,
            Atoms.flex_shrink_1,
            Atoms.pl_sm,
            Atoms.pr_xs,
            inline ? { paddingVertical: Spacing['2xs'] } : Atoms.py_xs,
          ]}
        >
          {action === 'Show' ? (
            // Asterisks sit on the cap line; nudge them to the middle.
            <Text
              variant="small"
              fontSize="xs"
              lineHeight="xs"
              fontWeight="bold"
              color="secondary"
              style={{ transform: [{ translateY: Spacing['2xs'] }] }}
            >
              *****
            </Text>
          ) : (
            <Text
              variant="small"
              fontSize="xs"
              lineHeight="xs"
              numberOfLines={1}
              color="secondary"
              style={Atoms.flex_shrink_1}
            >
              {labelNames(labels)}
            </Text>
          )}
        </View>
      )}
      {action ? (
        <View
          style={[
            Atoms.px_sm,
            inline ? { paddingVertical: Spacing['2xs'] } : Atoms.py_xs,
            Atoms.self_stretch,
            Atoms.justify_center,
            theme.atoms.box.secondary.bg_hover,
          ]}
        >
          <Text
            variant="small"
            fontSize="xs"
            lineHeight="xs"
            fontWeight="bold"
            color="secondary"
          >
            {action}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
