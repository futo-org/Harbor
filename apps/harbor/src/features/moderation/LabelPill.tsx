import Icon from '@/src/common/components/Icon';
import { Text } from '@/src/common/components/primitives/Text';
import type { PostLabel } from '@/src/common/lib/polycentric-hooks/helpers';
import { moderationLabelName } from '@/src/common/settings/moderationLabels';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { Pressable, View } from 'react-native';

export function labelNames(labels: PostLabel[]): string {
  return labels.map((label) => moderationLabelName(label.value)).join(', ');
}

/** Labels as a pill, with an optional Show or Hide segment. */
export function LabelPill({
  labels,
  action,
  onPress,
  inline = false,
}: {
  labels: PostLabel[];
  action?: 'Show' | 'Hide';
  onPress?: () => void;
  /** Inside a line of text: less vertical padding. */
  inline?: boolean;
}) {
  const { theme } = useTheme();
  const textColor = theme.palette.neutral_600;
  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.self_start,
        Atoms.rounded_full,
        Atoms.overflow_hidden,
        { backgroundColor: theme.palette.neutral_25 },
      ]}
    >
      <View
        // Not a press target, even inside a pressable post.
        onStartShouldSetResponder={() => true}
        style={[
          Atoms.flex_row,
          Atoms.align_center,
          Atoms.gap_xs,
          Atoms.px_xs,
          inline ? { paddingVertical: Spacing['2xs'] } : Atoms.py_xs,
          Atoms.cursor_default,
        ]}
      >
        <Icon name="infoOutline" color={textColor} />
        <Text
          variant="small"
          fontSize="xs"
          lineHeight="xs"
          style={{ color: textColor }}
        >
          {action === 'Show'
            ? `Hidden for ${labelNames(labels).toLowerCase()}`
            : labelNames(labels)}
        </Text>
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action}
          onPress={onPress}
          style={({ pressed }) => [
            Atoms.px_sm,
            inline ? { paddingVertical: Spacing['2xs'] } : Atoms.py_xs,
            Atoms.self_stretch,
            Atoms.justify_center,
            { backgroundColor: theme.palette.neutral_50 },
            pressed && { opacity: 0.5 },
          ]}
        >
          <Text
            variant="small"
            fontSize="xs"
            lineHeight="xs"
            fontWeight="bold"
            style={{ color: textColor }}
          >
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
