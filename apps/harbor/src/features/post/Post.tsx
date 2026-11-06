import { ProfileAvatar, Text } from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import { TimeAgo } from '@/src/common/components/TimeAgo';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { eventRoute } from '@/src/common/lib/navigation/eventRoute';
import { COLLECTION } from '@polycentric/react-native';
import { router } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { PostContent } from './content/PostContent';
import { PostAuthor } from './PostAuthor';
import { PostHeader } from './PostHeader';
import PostMenu from './PostMenu';
import { PostToolbar } from './toolbar/PostToolbar';
import { PostWarnOverlay } from './PostWarnOverlay';
import { usePostModeration } from './hooks/usePostModeration';

interface PostProps {
  post: PostData;
  hideReplyingTo?: boolean;
  /** Used on full view pages */
  focusedView?: boolean;
  /** When true, tapping the card root is a no-op (e.g. the focused post in a conversation). */
  disablePress?: boolean;
  /** Draw a vertical line above the avatar — connects up to the previous post. */
  showThreadLineAbove?: boolean;
  /** Draw a vertical line below the avatar — connects down to the next post. */
  showThreadLineBelow?: boolean;
  /** Hide the bottom hairline (used inside conversation views where the thread line is the visual seam instead). */
  hideBottomBorder?: boolean;
  /** Render the link preview in its compact side-image layout (used in feeds). */
  compactLinkPreview?: boolean;
}

export const Post = memo(function Post({
  post,
  hideReplyingTo = false,
  focusedView = false,
  disablePress = false,
  showThreadLineAbove = false,
  showThreadLineBelow = false,
  hideBottomBorder = false,
  compactLinkPreview = false,
}: PostProps) {
  const { theme } = useTheme();

  const authorIdentity = post.identity ?? null;

  const handlePress = useCallback(() => {
    if (disablePress) return;
    const route = eventRoute({ ...post, collection: COLLECTION.FEED });
    if (route) router.navigate(route);
  }, [disablePress, post]);

  const handleAuthorPress = useCallback(() => {
    if (!authorIdentity) return;
    router.navigate(Routes.tabs.profile(authorIdentity));
  }, [authorIdentity]);

  const shownAt = post.createdAt;
  const fullTimestamp = useMemo(() => {
    if (!shownAt) return '';
    const date = new Date(Number(shownAt));
    const timePart = date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    const datePart = date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    return `${timePart} · ${datePart}`;
  }, [shownAt]);

  const { hasWarnContent, warnLabels } = usePostModeration(post.labels);
  const [warnDismissed, setWarnDismissed] = useState(false);
  const handleWarnDismiss = useCallback(() => setWarnDismissed(true), []);
  const handleWarnRestore = useCallback(() => setWarnDismissed(false), []);

  const avatar = authorIdentity ? (
    <ProfileAvatar
      identityKey={authorIdentity}
      size="md"
      onPress={handleAuthorPress}
    />
  ) : null;

  const authorRow = (
    <View style={[Atoms.flex_row, Atoms.align_center, Atoms.gap_sm]}>
      <View
        style={[Atoms.flex_1, Atoms.flex_row, Atoms.gap_xs, Atoms.align_center]}
      >
        <PostAuthor identity={authorIdentity} onNamePress={handleAuthorPress} />

        {shownAt ? (
          <>
            <Text
              variant="secondary"
              color="neutral_500"
              fontWeight="bold"
              style={Atoms.flex_shrink_0}
            >
              ·
            </Text>
            <Text
              variant="secondary"
              color="neutral_500"
              style={Atoms.flex_shrink_0}
            >
              <TimeAgo since={shownAt} />
            </Text>
          </>
        ) : null}
      </View>

      <PostMenu post={post} />
    </View>
  );

  const body =
    hasWarnContent && !warnDismissed ? (
      <PostWarnOverlay
        labels={warnLabels}
        authorIdentity={authorIdentity}
        onDismiss={handleWarnDismiss}
      />
    ) : (
      <PostContent
        post={post}
        hideReplyingTo={hideReplyingTo}
        compactLinkPreview={compactLinkPreview}
        focusedView={focusedView}
        labelPill={{
          labels: post.labels ?? [],
          onHide: hasWarnContent ? handleWarnRestore : undefined,
        }}
      />
    );

  return (
    <Pressable
      role="article"
      style={({ pressed }) => [
        Atoms.w_full,
        Atoms.px_md,
        !hideBottomBorder && {
          borderBottomWidth: 1,
          borderBottomColor: withHexOpacity(theme.palette.neutral_500, '20'),
        },
        pressed && {
          backgroundColor: withHexOpacity(theme.palette.neutral_500, '10'),
        },
      ]}
      onPress={handlePress}
      disabled={disablePress}
    >
      <PostHeader
        repostedBy={post.repostedBy}
        repostedAt={post.repostedAt}
        showThreadLineAbove={showThreadLineAbove}
      />

      {focusedView ? (
        <View style={[Atoms.pb_xs, Atoms.gap_sm]}>
          <View style={[Atoms.flex_row, Atoms.align_center, Atoms.gap_md]}>
            {avatar}
            <View style={[Atoms.flex_1, Atoms.gap_2xs]}>
              <PostAuthor
                identity={authorIdentity}
                onNamePress={handleAuthorPress}
                stacked
              />
            </View>
            <PostMenu post={post} />
          </View>
          <View style={Atoms.gap_2xs}>{body}</View>
          {fullTimestamp ? (
            <Text variant="secondary" color="neutral_500">
              {fullTimestamp}
            </Text>
          ) : null}
          <PostToolbar post={post} />
        </View>
      ) : (
        <View style={[Atoms.flex_row, Atoms.gap_md]}>
          {/* Left side (avatar and thread line) */}
          <View style={[Atoms.align_center]}>
            {avatar}
            {showThreadLineBelow ? (
              <View
                style={[
                  Atoms.flex_1,
                  {
                    width: 2,
                    backgroundColor: withHexOpacity(
                      theme.palette.neutral_500,
                      '30',
                    ),
                  },
                ]}
              />
            ) : null}
          </View>

          <View style={[Atoms.flex_1, Atoms.pb_xs, Atoms.gap_2xs]}>
            {authorRow}
            {body}
            <PostToolbar post={post} />
          </View>
        </View>
      )}
    </Pressable>
  );
});
