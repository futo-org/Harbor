import { Text } from '@/src/common/components';
import { TimeAgo } from '@/src/common/components/TimeAgo';
import { Atoms } from '@/src/common/theme';
import type { ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

/**
 * A summary of an event, which includes an avatar, identity name, action (like "posted" or
 * "reacted"), and how long ago the action was performed. For applicable events (posts, reposts, and
 * reactions to a post) it will also include a two-line preview text of the post.
 */
export function EventSummary({
  leading,
  title,
  action,
  createdAt,
  preview,
  children,
  style,
}: {
  leading: ReactNode;
  /** Usually the actor's username */
  title: ReactNode;
  /** What happened, e.g. "reacted to your post" */
  action?: string;
  /** Epoch ms; omitted (or 0) hides the time */
  createdAt?: number;
  preview?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[Atoms.flex_row, Atoms.gap_md, style]}>
      {leading}
      <View style={[Atoms.flex_1, Atoms.gap_xs]}>
        <View style={[Atoms.flex_row, Atoms.items_center, Atoms.flex_wrap]}>
          {title}
          <Text>
            {action ? ` ${action}` : null}
            {createdAt && createdAt > 0 ? (
              <Text color="neutral_500">
                {' '}
                · <TimeAgo since={createdAt} />
              </Text>
            ) : null}
          </Text>
        </View>
        {preview ? (
          <Text variant="secondary" color="neutral_500" numberOfLines={2}>
            {preview}
          </Text>
        ) : null}
        {children}
      </View>
    </View>
  );
}
