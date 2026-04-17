import { Avatar, PubkeyTag, Text } from '@/src/common/components/primitives';
import { openCompose, Routes } from '@/src/common/constants';
import {
  eventKey,
  identiconUrl,
  postIdToSequence,
  timeAgo,
  truncateName,
  usePolycentricContext,
  useStore,
  useUsername,
} from '@/src/common/lib/polycentric-hooks';
import { useWebHover } from '@/src/common/lib/useWebHover';
import {
  Atoms,
  type Theme,
  useTheme,
  withHexOpacity,
} from '@/src/common/theme';
import { Ionicons } from '@expo/vector-icons';
import { types } from '@polycentric/react-native';
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, View } from 'react-native';

const EMPTY_PUBKEY = types.PublicKey.create();
const PREVIEW_LIMIT = 240;
const MAX_DISPLAY_LIMIT = 2000;

interface PostProps {
  postId: string;
  hideReplyingTo?: boolean;
  /** When true, tapping the card root is a no-op (e.g. the focused post in a conversation). */
  disablePress?: boolean;
}

export const Post = memo(function Post({
  postId,
  hideReplyingTo = false,
  disablePress = false,
}: PostProps) {
  const { theme } = useTheme();
  const { store } = usePolycentricContext();
  const post = useStore(store, (s) => s.posts[postId]);

  useEffect(() => {
    store.getState().ensurePostMetadataLoaded(postId);
  }, [store, postId]);

  const authorName = useUsername(post?.decoded.authorPublicKey ?? EMPTY_PUBKEY);
  const replyingToName = useUsername(
    post?.decoded.parentAuthorPublicKey ?? EMPTY_PUBKEY,
  );

  const rawContent = post?.decoded.content ?? '';
  const [contentExpanded, setContentExpanded] = useState(false);

  useEffect(() => {
    setContentExpanded(false);
  }, [postId]);

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

  const parentPostId = useMemo(() => {
    const decoded = post?.decoded;
    if (
      !decoded?.parentAuthorPublicKey?.key ||
      !decoded.parentProcess?.process ||
      decoded.parentLogicalClock == null
    ) {
      return undefined;
    }
    return eventKey(
      decoded.parentAuthorPublicKey.key,
      decoded.parentProcess.process,
      decoded.parentLogicalClock,
    );
  }, [post?.decoded]);

  const { hovered: replyingToHovered, onHoverIn, onHoverOut } = useWebHover();
  const {
    hovered: expandHovered,
    onHoverIn: onExpandHoverIn,
    onHoverOut: onExpandHoverOut,
  } = useWebHover();

  const authorPublicKey = post?.decoded.authorPublicKey;
  const authorIdentity = post?.decoded.authorIdentity;

  const handlePress = useCallback(() => {
    if (disablePress) return;
    if (!authorIdentity) return;
    const sequence = postIdToSequence(postId);
    if (!sequence) return;
    router.push(Routes.tabs.post(authorIdentity, sequence));
  }, [disablePress, authorIdentity, postId]);

  const handleAuthorPress = useCallback(() => {
    if (!authorIdentity) return;
    router.push(Routes.tabs.profile(authorIdentity));
  }, [authorIdentity]);

  const handleReply = useCallback(() => {
    openCompose(postId);
  }, [postId]);

  const parentAuthorIdentity = useStore(store, (state) =>
    parentPostId
      ? (state.posts[parentPostId]?.decoded.authorIdentity ?? null)
      : null,
  );

  const handleReplyingToPress = useCallback(() => {
    if (!parentPostId || !parentAuthorIdentity) return;
    const sequence = postIdToSequence(parentPostId);
    if (!sequence) return;
    router.push(Routes.tabs.post(parentAuthorIdentity, sequence));
  }, [parentPostId, parentAuthorIdentity]);

  const handleLike = useCallback(() => {
    store.getState().likePost(postId);
  }, [store, postId]);

  const handleDislike = useCallback(() => {
    store.getState().dislikePost(postId);
  }, [store, postId]);

  const toggleContentExpanded = useCallback(() => {
    setContentExpanded((v) => !v);
  }, []);

  if (!post) return null;

  const liked = post.myOpinion === types.Opinion.LIKE;
  const disliked = post.myOpinion === types.Opinion.DISLIKE;
  const avatarUrl = authorPublicKey ? identiconUrl(authorPublicKey) : null;
  const time = timeAgo(post.decoded.timestamp);
  const hasParent = !!post.decoded.parentAuthorPublicKey;

  return (
    <Pressable
      style={[
        Atoms.w_full,
        Atoms.px_lg,
        Atoms.pt_sm,
        { paddingBottom: 6 },
        {
          borderBottomWidth: 1,
          borderBottomColor: withHexOpacity(theme.palette.neutral_500, '20'),
        },
      ]}
      onPress={handlePress}
      disabled={disablePress}
    >
      <View style={[Atoms.flex_row, Atoms.gap_md]}>
        <Avatar
          source={avatarUrl ? { uri: avatarUrl } : undefined}
          size="sm"
          onPress={handleAuthorPress}
          containerProps={{ style: { marginTop: 3 } }}
        />

        <View style={Atoms.flex_1}>
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
              <PostAuthorName name={authorName} onPress={handleAuthorPress} />
              {authorPublicKey ? (
                <PubkeyTag
                  publicKey={authorPublicKey}
                  identity={post.decoded.authorIdentity}
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

          {!hideReplyingTo && hasParent && (
            <Pressable
              onPress={handleReplyingToPress}
              disabled={!parentPostId}
              onHoverIn={parentPostId ? onHoverIn : undefined}
              onHoverOut={parentPostId ? onHoverOut : undefined}
              style={{ alignSelf: 'flex-start', marginTop: 2 }}
            >
              <Text
                variant="small"
                style={[
                  theme.atoms.text_neutral_medium,
                  { lineHeight: 16 },
                  parentPostId &&
                    replyingToHovered && { textDecorationLine: 'underline' },
                ]}
              >
                Replying to{' '}
                <Text
                  variant="small"
                  style={[
                    theme.atoms.text_neutral_high,
                    parentPostId &&
                      replyingToHovered && { textDecorationLine: 'underline' },
                  ]}
                >
                  {truncateName(replyingToName, 16)}
                </Text>
              </Text>
            </Pressable>
          )}

          <Text variant="secondary" style={{ marginTop: 4, lineHeight: 20 }}>
            {displayContent}
            {isTruncatedPreview ? '...' : ''}
          </Text>
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
        </View>
      </View>

      <View
        style={[
          Atoms.flex_row,
          Atoms.justify_between,
          { marginTop: 8, paddingLeft: 42 },
        ]}
      >
        <ActionButton
          icon="chatbubble-outline"
          count={post.stats.comments}
          onPress={handleReply}
          color={theme.palette.neutral_500}
        />
        <ActionButton
          icon={disliked ? 'arrow-down' : 'arrow-down-outline'}
          count={post.stats.dislikes}
          onPress={handleDislike}
          color={
            disliked ? theme.palette.negative_500 : theme.palette.neutral_500
          }
        />
        <ActionButton
          icon={liked ? 'arrow-up' : 'arrow-up-outline'}
          count={post.stats.likes}
          onPress={handleLike}
          color={liked ? theme.palette.primary_500 : theme.palette.neutral_500}
        />
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

function actionIconHoverColor(iconColor: string, theme: Theme): string {
  if (iconColor === theme.palette.primary_500) {
    return theme.palette.primary_600;
  }
  if (iconColor === theme.palette.negative_500) {
    return theme.palette.negative_600;
  }
  return theme.palette.neutral_700;
}

function ActionButton({
  icon,
  count,
  onPress,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  count?: number;
  onPress?: () => void;
  color: string;
}) {
  const { theme } = useTheme();
  const { hovered, onHoverIn, onHoverOut } = useWebHover();
  const resolvedIconColor = hovered
    ? actionIconHoverColor(color, theme)
    : color;

  const iconSurface: StyleProp<ViewStyle> = [
    Atoms.p_xs,
    Atoms.rounded_md,
    {
      backgroundColor: hovered
        ? withHexOpacity(theme.palette.neutral_500, '14')
        : 'transparent',
    },
  ];

  return (
    <Pressable
      style={[Atoms.flex_row, Atoms.items_center, { gap: 3, minHeight: 20 }]}
      onPress={onPress}
      disabled={!onPress}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
    >
      <View style={iconSurface}>
        <Ionicons name={icon} size={16} color={resolvedIconColor} />
      </View>
      {count !== undefined ? (
        <Text
          variant="small"
          color="neutral_500"
          style={{ minWidth: 28, lineHeight: 16 }}
        >
          {count ? String(count) : ' '}
        </Text>
      ) : null}
    </Pressable>
  );
}
