import { Avatar, IdentityTag, Text } from '@/src/common/components/primitives';
import { openCompose, Routes } from '@/src/common/constants';
import {
  identiconUrl,
  postIdToSequence,
  timeAgo,
  truncateName,
  useUsername,
  type PostData,
} from '@/src/common/lib/polycentric-hooks';
import { useWebHover } from '@/src/common/lib/useWebHover';
import {
  Atoms,
  type Theme,
  useTheme,
  withHexOpacity,
} from '@/src/common/theme';
import { Ionicons } from '@expo/vector-icons';
import { v2 } from '@polycentric/react-native';
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, View } from 'react-native';

const PREVIEW_LIMIT = 240;
const MAX_DISPLAY_LIMIT = 2000;

interface PostProps {
  post: PostData;
  hideReplyingTo?: boolean;
  /** When true, tapping the card root is a no-op (e.g. the focused post in a conversation). */
  disablePress?: boolean;
}

export const Post = memo(function Post({
  post,
  hideReplyingTo: _hideReplyingTo = false,
  disablePress = false,
}: PostProps) {
  const { theme } = useTheme();
  const postId = post.id;

  const authorIdentity = post.identity ?? null;

  const authorName = useUsername(authorIdentity);

  const rawContent = post.content ?? '';
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

  const {
    hovered: expandHovered,
    onHoverIn: onExpandHoverIn,
    onHoverOut: onExpandHoverOut,
  } = useWebHover();

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
    if (!authorIdentity) return;
    const sequence = postIdToSequence(postId);
    if (!sequence) return;
    openCompose({ identityId: authorIdentity, sequence });
  }, [authorIdentity, postId]);

  const handleLike = useCallback(() => {}, []);

  const handleDislike = useCallback(() => {}, []);

  const toggleContentExpanded = useCallback(() => {
    setContentExpanded((v) => !v);
  }, []);

  const liked = false;
  const disliked = false;
  const avatarUrl = authorIdentity ? identiconUrl(authorIdentity) : null;
  const time = timeAgo(Number(post.createdAt));

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
          onPress={handleReply}
          color={theme.palette.neutral_500}
        />
        <ActionButton
          icon={disliked ? 'arrow-down' : 'arrow-down-outline'}
          onPress={handleDislike}
          color={
            disliked ? theme.palette.negative_500 : theme.palette.neutral_500
          }
        />
        <ActionButton
          icon={liked ? 'arrow-up' : 'arrow-up-outline'}
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
