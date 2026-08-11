import HoverCard from '@/src/common/components/HoverCard';
import Icon from '@/src/common/components/Icon';
import { Text } from '@/src/common/components/primitives';
import { shortenIdentityId } from '@/src/common/lib/polycentric-hooks';
import type { PostLabel } from '@/src/common/lib/polycentric-hooks/helpers';
import { MODERATION_LABELS, moderationLabelName } from '@/src/common/settings';
import { Atoms, useTheme } from '@/src/common/theme';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { Pressable, View } from 'react-native';

export function PostLabels({
  labels,
  authorIdentity,
}: {
  labels: PostLabel[];
  authorIdentity?: string | null;
}) {
  if (labels.length === 0) return null;

  return (
    <View style={[Atoms.flex_row, Atoms.gap_xs, Atoms.flex_wrap]}>
      {labels.map((label) => (
        <LabelChip
          key={label.value}
          label={label}
          authorIdentity={authorIdentity}
        />
      ))}
    </View>
  );
}

/** A single label pill. Hovering (web) or tapping (native) reveals who
 *  applied the label. */
function LabelChip({
  label,
  authorIdentity,
}: {
  label: PostLabel;
  authorIdentity?: string | null;
}) {
  const { theme } = useTheme();

  const isModerationLabel = (MODERATION_LABELS as readonly string[]).includes(
    label.value,
  );
  const bg = isModerationLabel ? theme.palette.warning_25 : undefined;
  const textColor = isModerationLabel
    ? theme.palette.warning_700
    : theme.palette.neutral_600;

  const byAuthor = !!label.labeledBy && label.labeledBy === authorIdentity;
  const labelerProfile = useProfile(byAuthor ? null : label.labeledBy || null);
  const attribution = !label.labeledBy
    ? null
    : byAuthor
      ? 'Applied by the author'
      : `Applied by ${labelerProfile.name ?? shortenIdentityId(label.labeledBy)}`;

  const chip = (
    <View
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.gap_2xs,
        Atoms.rounded_full,
        Atoms.px_xs,
        Atoms.pr_sm,
        Atoms.py_xs,
        { backgroundColor: bg },
      ]}
    >
      <Icon name="infoOutline" color={textColor} />
      <Text
        variant="small"
        fontSize="xs"
        lineHeight="xs"
        style={{ color: textColor }}
      >
        {moderationLabelName(label.value)}
      </Text>
    </View>
  );

  if (!attribution) return chip;

  return (
    <HoverCard openDelay={0}>
      <HoverCard.Trigger asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={moderationLabelName(label.value)}
        >
          {chip}
        </Pressable>
      </HoverCard.Trigger>
      <HoverCard.Content side="top" align="start" animated={false}>
        <View
          style={[
            Atoms.p_sm,
            Atoms.rounded_md,
            {
              maxWidth: 320,
              borderWidth: 1,
              borderColor: theme.palette.neutral_300,
              backgroundColor: theme.palette.background_secondary,
            },
          ]}
        >
          <Text variant="small" color="neutral_900">
            {attribution}
          </Text>
        </View>
      </HoverCard.Content>
    </HoverCard>
  );
}
