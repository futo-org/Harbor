import { Text } from '@/src/common/components';
import { ProfileAvatar } from '@/src/common/components/Avatar/ProfileAvatar';
import { Routes } from '@/src/common/constants';
import {
  timeAgo,
  truncateName,
  type PostData,
} from '@/src/common/lib/polycentric-hooks';
import { getKeyFingerprint } from '@/src/common/lib/polycentric-hooks/helpers';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { Post } from '@/src/features/post/Post';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import type {
  NotificationData,
  QuoteNotification,
  ReplyNotification,
} from './utils';

/** Notifications rendered as the actor's own post. */
type PostNotification = ReplyNotification | QuoteNotification;

/** Route to a post's thread, or `null` when its key can't be fingerprinted. */
function postRoute(post: PostData) {
  const fingerprint = getKeyFingerprint(post.signedBy);
  return fingerprint
    ? Routes.tabs.post(post.identity, fingerprint, post.sequence)
    : null;
}

/** What the actor did, e.g. "reacted to your post". */
function summary(
  notification: Exclude<NotificationData, PostNotification>,
): string {
  switch (notification.kind) {
    case 'follow':
      return 'followed you';
    case 'repost':
      return 'reposted your post';
    case 'reaction':
      return notification.emoji
        ? `reacted ${notification.emoji} to your post`
        : 'reacted to your post';
  }
}

/** Your post, shown as a quoted block — the thing acted upon. */
function quotedPost(
  notification: Exclude<NotificationData, PostNotification>,
): PostData | undefined {
  switch (notification.kind) {
    case 'reaction':
    case 'repost':
      return notification.targetPost;
    case 'follow':
      return undefined;
  }
}

export default function Notification({
  notification,
}: {
  notification: NotificationData;
}) {
  // Replies and quotes are just the actor's post (the quote embeds the
  // quoted post itself).
  if (notification.kind === 'reply') {
    return <Post post={notification.reply} />;
  }
  if (notification.kind === 'quote') {
    return <Post post={notification.quote} />;
  }
  return <InteractionNotification notification={notification} />;
}

/** Follow / repost / reaction, rendered as an actor + action row with an
 *  optional quoted post. */
function InteractionNotification({
  notification,
}: {
  notification: Exclude<NotificationData, PostNotification>;
}) {
  const { theme } = useTheme();
  const profile = useProfile(notification.fromIdentity);
  const name = truncateName(profile.name ?? 'Anonymous');

  const quoted = quotedPost(notification);

  const handlePress = useCallback(() => {
    const post =
      notification.kind === 'follow' ? undefined : notification.targetPost;
    const route = post ? postRoute(post) : null;
    router.push(route ?? Routes.tabs.profile(notification.fromIdentity));
  }, [notification]);

  const openProfile = useCallback(
    () => router.push(Routes.tabs.profile(notification.fromIdentity)),
    [notification.fromIdentity],
  );

  const dim = withHexOpacity(theme.palette.neutral_500, '40');

  return (
    <Pressable
      onPress={handlePress}
      style={[
        Atoms.flex_row,
        Atoms.gap_md,
        Atoms.p_md,
        {
          borderBottomWidth: 1,
          borderBottomColor: withHexOpacity(theme.palette.neutral_500, '20'),
        },
      ]}
    >
      <ProfileAvatar
        identityKey={notification.fromIdentity}
        size="md"
        onPress={openProfile}
      />
      <View style={[Atoms.flex_1, Atoms.gap_xs]}>
        <Text>
          <Text fontWeight="bold" onPress={openProfile}>
            {name}
          </Text>{' '}
          {summary(notification)}
          {notification.createdAt > 0 ? (
            <Text color="neutral_500">
              {' '}
              · {timeAgo(notification.createdAt)}
            </Text>
          ) : null}
        </Text>

        {/* The post the action was taken against, quoted. */}
        {quoted?.content ? (
          <View style={[]}>
            <Text variant="secondary" color="neutral_500" numberOfLines={2}>
              {quoted.content}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
