import { Button, Text } from '@/src/common/components/primitives';
import Icon from '@/src/common/components/Icon';
import { shortenIdentityId } from '@/src/common/lib/polycentric-hooks';
import type { PostLabel } from '@/src/common/lib/polycentric-hooks/helpers';
import { moderationLabelName } from '@/src/common/settings';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { View } from 'react-native';

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

  const labelNames = labels.map((l) => moderationLabelName(l.value)).join(', ');

  const labeledBy = labels.find((l) => l.labeledBy)?.labeledBy ?? null;
  const byAuthor = labeledBy !== null && labeledBy === authorIdentity;
  const labelerProfile = useProfile(byAuthor ? null : labeledBy);
  const attribution = !labeledBy
    ? null
    : byAuthor
      ? 'Applied by the author'
      : `Applied by ${labelerProfile.name ?? shortenIdentityId(labeledBy)}`;

  return (
    <View
      style={[
        Atoms.gap_lg,
        Atoms.mt_xs,
        Atoms.px_md,
        Atoms.pl_lg,
        Atoms.py_sm,
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.rounded_md,
        {
          backgroundColor: withHexOpacity(theme.palette.neutral_500, '14'),
        },
      ]}
    >
      <Icon name="infoOutline" color="neutral_500" />
      <View style={[Atoms.flex_1]}>
        <Text variant="secondary" fontWeight="bold" color="neutral_700">
          {labelNames}
        </Text>
        {attribution ? (
          <Text variant="small" color="neutral_500" fontWeight="regular">
            {attribution}
          </Text>
        ) : null}
      </View>
      <Button
        onPress={onDismiss}
        variant="tertiary"
        style={[{ borderWidth: 0 }]}
        title="Show"
      />
    </View>
  );
}
