import { Text } from '@/src/common/components/primitives';
import Icon from '@/src/common/components/Icon';
import { Atoms, useTheme } from '@/src/common/theme';
import type { PostLabel } from '@/src/common/lib/polycentric-hooks/helpers';
import { labelNames } from '@/src/features/moderation/LabelPill';
import { ModerationWarningSheet } from '@/src/features/moderation/ModerationWarningSheet';
import { useLabeler } from '@/src/features/moderation/useLabeler';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

/**
 * Rendered in place of a post's content when a label the user has set to
 * "warn" applies: names the labels, says who applied them, and offers a
 * button to reveal the post.
 */
export function PostWarnOverlay({
  labels,
  authorIdentity,
  onDismiss,
}: {
  labels: PostLabel[];
  authorIdentity: string | null;
  onDismiss: () => void;
}) {
  const { theme } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);

  const labeler = useLabeler(labels, authorIdentity);
  const attribution = !labeler
    ? null
    : labeler.isSubject
      ? 'Applied by the author'
      : `Applied by ${labeler.name}`;

  return (
    <View
      style={[
        Atoms.mt_xs,
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.rounded_md,
        Atoms.overflow_hidden,
        { backgroundColor: theme.palette.neutral_25 },
      ]}
    >
      <View
        style={[
          Atoms.flex_1,
          Atoms.flex_row,
          Atoms.align_center,
          Atoms.gap_lg,
          Atoms.pl_lg,
          Atoms.pr_md,
          Atoms.py_sm,
        ]}
      >
        <Icon name="infoOutline" color="neutral_700" />
        <View style={[Atoms.flex_1]}>
          <Text variant="secondary" fontWeight="bold" color="neutral_700">
            Hidden for {labelNames(labels).toLowerCase()}
          </Text>
          {attribution ? (
            <Text variant="small" color="neutral_500" fontWeight="regular">
              {attribution}
            </Text>
          ) : null}
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Show"
        onPress={() => setSheetOpen(true)}
        style={({ pressed }) => [
          Atoms.px_md,
          Atoms.self_stretch,
          Atoms.justify_center,
          { backgroundColor: theme.palette.neutral_50 },
          pressed && { opacity: 0.5 },
        ]}
      >
        <Text variant="secondary" fontWeight="bold" color="neutral_600">
          Show
        </Text>
      </Pressable>
      <ModerationWarningSheet
        labels={labels}
        identity={authorIdentity}
        subject="post"
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onConfirm={() => {
          setSheetOpen(false);
          onDismiss();
        }}
      />
    </View>
  );
}
