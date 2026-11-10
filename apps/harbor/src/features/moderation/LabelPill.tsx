import { Text } from '@/src/common/components/primitives/Text';
import type { PostLabel } from '@/src/common/lib/polycentric-hooks/helpers';
import { moderationLabelName } from '@/src/common/settings/moderationLabels';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ModerationWarningSheet } from './ModerationWarningSheet';

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
  const textColor = theme.palette.neutral_600;
  // Showing goes through the sheet's confirm; hiding is immediate.
  const [sheetOpen, setSheetOpen] = useState(false);
  const handlePress = action === 'Show' ? () => setSheetOpen(true) : onPress;
  return (
    <>
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
          { backgroundColor: theme.palette.neutral_25 },
          pressed && { opacity: 0.5 },
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
              // Asterisks sit on the cap line, so push them down to the middle.
              <Text
                variant="small"
                fontSize="sm"
                lineHeight={Spacing.md}
                fontWeight="bold"
                style={[Atoms.pt_xs, { color: textColor }]}
              >
                *****
              </Text>
            ) : (
              <Text
                variant="small"
                fontSize="xs"
                lineHeight="xs"
                numberOfLines={1}
                style={[Atoms.flex_shrink_1, { color: textColor }]}
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
              { backgroundColor: theme.palette.neutral_50 },
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
          </View>
        ) : null}
      </Pressable>
      {action === 'Show' ? (
        <ModerationWarningSheet
          labels={labels}
          identity={identity}
          subject="profile"
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onConfirm={() => {
            setSheetOpen(false);
            onPress?.();
          }}
        />
      ) : null}
    </>
  );
}
