import {
  IdentityTag,
  ProfileAvatar,
  Text,
} from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import { timeAgo, type PostData } from '@/src/common/lib/polycentric-hooks';
import { getKeyFingerprint } from '@/src/common/lib/polycentric-hooks/helpers';
import { useWebHover } from '@/src/common/lib/useWebHover';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { router } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { PostContent } from './content/PostContent';
import { PostHeader } from './PostHeader';
import PostMenu from './PostMenu';
import { PostToolbar } from './toolbar/PostToolbar';
import { PostWarnOverlay } from './PostWarnOverlay';
import { usePostModeration } from './hooks/usePostModeration';

interface PostProps {
  post: PostData;
  hideReplyingTo?: boolean;
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
  disablePress = false,
  showThreadLineAbove = false,
  showThreadLineBelow = false,
  hideBottomBorder = false,
  compactLinkPreview = false,
}: PostProps) {
  const { theme } = useTheme();

  const authorIdentity = post.identity ?? null;

  const authorProfile = useProfile(authorIdentity);
  const authorName = authorProfile.name ?? '';

  const handlePress = useCallback(() => {
    if (disablePress) return;
    const keyFingerprint = getKeyFingerprint(post.signedBy);
    if (!keyFingerprint) return;
    router.push(Routes.tabs.post(post.identity, keyFingerprint, post.sequence));
  }, [disablePress, post]);

  const handleAuthorPress = useCallback(() => {
    if (!authorIdentity) return;
    router.push(Routes.tabs.profile(authorIdentity));
  }, [authorIdentity]);

  const time = useMemo(() => timeAgo(Number(post.createdAt)), [post.createdAt]);

  const { hasWarnContent, warnLabels } = usePostModeration(post.labels);
  const [warnDismissed, setWarnDismissed] = useState(false);
  const handleWarnDismiss = useCallback(() => setWarnDismissed(true), []);

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
        showThreadLineAbove={showThreadLineAbove}
      />

      {/* Main post body */}
      <View style={[Atoms.flex_row, Atoms.gap_md]}>
        {/* Left side (avatar and thread line) */}
        <View style={[Atoms.align_center]}>
          {authorIdentity ? (
            <ProfileAvatar
              identityKey={authorIdentity}
              size="md"
              onPress={handleAuthorPress}
            />
          ) : null}
          {showThreadLineBelow ? (
            <View
              style={[
                Atoms.flex_1,
                Atoms.mt_xs,
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

        {/* Main post content */}
        <View style={[Atoms.flex_1, Atoms.pb_xs, Atoms.gap_2xs]}>
          {/* Author name and other topbar items */}
          <View style={[Atoms.flex_row, Atoms.align_center, Atoms.gap_sm]}>
            <View
              style={[
                Atoms.flex_1,
                Atoms.flex_row,
                Atoms.gap_xs,
                Atoms.align_center,
              ]}
            >
              <PostAuthorName
                name={authorName || '...'}
                onPress={handleAuthorPress}
              />
              {authorIdentity ? (
                <IdentityTag identity={authorIdentity} />
              ) : null}

              {time ? (
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
                    {time}
                  </Text>
                </>
              ) : null}
            </View>

            {/* Menu */}
            <PostMenu post={post} />
          </View>

          {hasWarnContent && !warnDismissed ? (
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
              authorIdentity={authorIdentity}
            />
          )}
          <PostToolbar post={post} />
        </View>
      </View>
    </Pressable>
  );
});

function PostAuthorName({
  name,
  onPress,
}: {
  name: string;
  onPress: () => void;
}) {
  const { hovered, onHoverIn, onHoverOut } = useWebHover();

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      style={Atoms.flex_shrink_1}
    >
      <Text
        variant="secondary"
        fontWeight="bold"
        numberOfLines={1}
        style={[hovered && { textDecorationLine: 'underline' }]}
      >
        {name}
      </Text>
    </Pressable>
  );
}
