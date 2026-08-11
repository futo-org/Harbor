import {
  IdentityTag,
  ProfileAvatar,
  Text,
} from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import { timeAgo, type PostData } from '@/src/common/lib/polycentric-hooks';
import {
  getKeyFingerprint,
  hexToBytes,
} from '@/src/common/lib/polycentric-hooks/helpers';
import { useWebHover } from '@/src/common/lib/useWebHover';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { v2 } from '@polycentric/react-native';
import { router } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { LinkPreviewCard } from './content/LinkPreviewCard';
import { PostContentQuote } from './content/PostContentQuote';
import { PostHeader } from './PostHeader';
import { PostImages } from './PostImages';
import PostMenu from './PostMenu';
import { PostText } from './PostText';
import { PostToolbar } from './toolbar/PostToolbar';

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

  const rawContent = post.content ?? '';
  const [contentExpanded, setContentExpanded] = useState(false);

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

  const toggleContentExpanded = useCallback(() => {
    setContentExpanded((v) => !v);
  }, []);

  const time = timeAgo(Number(post.createdAt));

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
                  >
                    ·
                  </Text>
                  <Text variant="secondary" color="neutral_500">
                    {time}
                  </Text>
                </>
              ) : null}
            </View>

            {/* Menu */}
            <PostMenu post={post} />
          </View>

          {!hideReplyingTo && post.reply?.parentId ? (
            <ReplyingToSubheader parentId={post.reply.parentId} />
          ) : null}

          {displayContent ? (
            <PostText
              content={displayContent}
              suffix={isTruncatedPreview ? '...' : ''}
            />
          ) : null}
          {/* Render only the first link preview. A post may carry multiple
              `links` (e.g. from another client), but we cap the UI at one. */}
          {post.links?.[0] ? (
            <LinkPreviewCard
              link={post.links[0]}
              compact={compactLinkPreview}
            />
          ) : null}
          {post.images?.length > 0 && <PostImages images={post.images} />}
          {post.quoteId ? <PostContentQuote quoteId={post.quoteId} /> : null}
          {showContentExpandToggle && (
            <Pressable
              onPress={toggleContentExpanded}
              onHoverIn={onExpandHoverIn}
              onHoverOut={onExpandHoverOut}
              style={[Atoms.self_start]}
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
          <PostToolbar post={post} />
        </View>
      </View>
    </Pressable>
  );
});

function ReplyingToSubheader({ parentId }: { parentId: string }) {
  const parentIdentity = useMemo(() => {
    try {
      return v2.EventKey.fromBinary(hexToBytes(parentId)).identity;
    } catch {
      return null;
    }
  }, [parentId]);

  const parentProfile = useProfile(parentIdentity);
  const parentName = parentProfile.name ?? '';

  const handlePress = useCallback(() => {
    if (!parentIdentity) return;
    router.push(Routes.tabs.profile(parentIdentity));
  }, [parentIdentity]);

  if (!parentIdentity) return null;

  return (
    <Pressable
      onPress={handlePress}
      style={[Atoms.flex_row, Atoms.align_center, Atoms.self_start]}
    >
      <Text variant="secondary" color="neutral_500" fontWeight="regular">
        Replying to{' '}
      </Text>
      <Text
        variant="secondary"
        color="primary_500"
        numberOfLines={1}
        style={Atoms.flex_shrink_1}
      >
        {parentName || '…'}
      </Text>
    </Pressable>
  );
}

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
