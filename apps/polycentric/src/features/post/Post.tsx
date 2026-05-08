import {
  IdentityTag,
  ProfileAvatar,
  Text,
} from '@/src/common/components/primitives';
import { openCompose, Routes } from '@/src/common/constants';
import {
  timeAgo,
  truncateName,
  type PostData,
} from '@/src/common/lib/polycentric-hooks';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { useWebHover } from '@/src/common/lib/useWebHover';
import { PostImages } from './PostImages';
import { PostToolbar } from './PostToolbar';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { getKeyFingerprint } from '@/src/common/lib/polycentric-hooks/helpers';

const PREVIEW_LIMIT = 240;
const MAX_DISPLAY_LIMIT = 2000;

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
}

export const Post = memo(function Post({
  post,
  hideReplyingTo: _hideReplyingTo = false,
  disablePress = false,
  showThreadLineAbove = false,
  showThreadLineBelow = false,
  hideBottomBorder = false,
}: PostProps) {
  const { theme } = useTheme();

  const authorIdentity = post.identity ?? null;

  const authorProfile = useProfile(authorIdentity);
  const authorName = authorProfile.name ?? '';

  const rawContent = post.content ?? '';
  const [contentExpanded, setContentExpanded] = useState(false);

  // useEffect(() => {
  //   setContentExpanded(false);
  // }, [postId]);

  const { displayContent, isTruncatedPreview, showContentExpandToggle } =
    useMemo(() => {
      const capped =
        rawContent.length > MAX_DISPLAY_LIMIT
          ? rawContent.slice(0, MAX_DISPLAY_LIMIT)
          : rawContent;
      const content = contentExpanded
        ? capped
        : capped.length > PREVIEW_LIMIT
          ? capped.slice(0, PREVIEW_LIMIT)
          : capped;
      const showToggle = rawContent.length > PREVIEW_LIMIT;
      return {
        displayContent: content,
        isTruncatedPreview: !contentExpanded && showToggle,
        showContentExpandToggle: showToggle,
      };
    }, [rawContent, contentExpanded]);

  const {
    hovered: expandHovered,
    onHoverIn: onExpandHoverIn,
    onHoverOut: onExpandHoverOut,
  } = useWebHover();

  const handlePress = useCallback(() => {
    if (disablePress) return;
    router.push(
      Routes.tabs.post(
        post.identity,
        getKeyFingerprint(post.signedBy)!,
        post.sequence,
      ),
    );
  }, [disablePress, post]);

  const handleAuthorPress = useCallback(() => {
    if (!authorIdentity) return;
    router.push(Routes.tabs.profile(authorIdentity));
  }, [authorIdentity]);

  const handleReply = useCallback(() => {
    openCompose({ replyTo: post.id });
  }, [authorIdentity, post]);

  const handleLike = useCallback(() => {}, []);

  const handleDislike = useCallback(() => {}, []);

  const toggleContentExpanded = useCallback(() => {
    setContentExpanded((v) => !v);
  }, []);

  const liked = false;
  const disliked = false;
  const time = timeAgo(Number(post.createdAt));

  return (
    <Pressable
      role="article"
      style={({ pressed }) => [
        Atoms.w_full,
        Atoms.px_lg,
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
      {/* Top padding bar */}
      <View style={[Atoms.flex_row, Atoms.gap_lg]}>
        <View
          style={[
            Atoms.align_center,
            !showThreadLineAbove && Atoms.pt_md,
            showThreadLineAbove && Atoms.mb_xs,
            {
              flexBasis: 40,
            },
          ]}
        >
          {showThreadLineAbove ? (
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
        {/* Empty */}
        <View style={[Atoms.flex_1, showThreadLineAbove && Atoms.pt_md]}></View>
      </View>

      {/* Main post body */}
      <View style={[Atoms.flex_row, Atoms.gap_lg]}>
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
        <View style={[Atoms.flex_1, Atoms.pb_md]}>
          {/* Author name and other topbar items */}
          <View
            style={[
              Atoms.flex_row,
              Atoms.justify_between,
              { alignItems: 'baseline', marginTop: -1 },
            ]}
          >
            <View
              style={[
                Atoms.flex_1,
                Atoms.flex_row,
                Atoms.gap_xs,
                { alignItems: 'baseline' },
              ]}
            >
              <PostAuthorName
                name={authorName || '...'}
                onPress={handleAuthorPress}
              />
              {authorIdentity ? (
                <IdentityTag
                  identity={authorIdentity}
                  style={{ transform: [{ translateY: 1 }] }}
                />
              ) : null}
            </View>

            {time ? (
              <Text
                variant="small"
                color="neutral_500"
                style={{ lineHeight: 18, marginLeft: 8 }}
              >
                {time}
              </Text>
            ) : null}
          </View>

          {displayContent ? (
            <Text variant="secondary" style={[Atoms.mt_xs]}>
              {displayContent}
              {isTruncatedPreview ? '...' : ''}
            </Text>
          ) : null}
          {post.images?.length > 0 && <PostImages images={post.images} />}
          {showContentExpandToggle && (
            <Pressable
              onPress={toggleContentExpanded}
              onHoverIn={onExpandHoverIn}
              onHoverOut={onExpandHoverOut}
              style={{ marginTop: 2, alignSelf: 'flex-start' }}
            >
              <Text
                variant="small"
                color="primary_500"
                style={
                  expandHovered
                    ? { textDecorationLine: 'underline' }
                    : undefined
                }
              >
                {contentExpanded ? 'Show less' : 'Show more'}
              </Text>
            </Pressable>
          )}
          <PostToolbar
            onReply={handleReply}
            onLike={handleLike}
            onDislike={handleDislike}
            liked={liked}
            disliked={disliked}
            style={{ marginTop: 8 }}
          />
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
    <Pressable onPress={onPress} onHoverIn={onHoverIn} onHoverOut={onHoverOut}>
      <Text
        variant="secondary"
        fontWeight="bold"
        style={[
          { lineHeight: 18 },
          hovered && { textDecorationLine: 'underline' },
        ]}
      >
        {truncateName(name, 16)}
      </Text>
    </Pressable>
  );
}
