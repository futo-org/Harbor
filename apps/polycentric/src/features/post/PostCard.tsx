import { Avatar, PubkeyTag, Text } from '@/src/common/components/primitives';
import {
  identiconUrl,
  timeAgo,
  truncateName,
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
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, View } from 'react-native';

export interface PostCardProps {
  displayContent: string;
  isTruncatedPreview: boolean;
  showContentExpandToggle: boolean;
  contentExpanded: boolean;
  onToggleContentExpanded: () => void;
  authorName: string;
  authorPublicKey: types.PublicKey;
  /** v2 identity id the author signed under; preferred over pubkey for display. */
  authorIdentity?: string;
  timestamp: number;
  replyingToName: string;
  hasParent: boolean;
  likes: number;
  dislikes: number;
  comments: number;
  liked: boolean;
  disliked: boolean;
  onPress?: () => void;
  onAuthorPress?: () => void;
  onReply?: () => void;
  onReplyingToPress?: () => void;
  onLike: () => void;
  onDislike: () => void;
  hideReplyingTo?: boolean;
  showTopic?: boolean;
}

export function PostCard({
  displayContent,
  isTruncatedPreview,
  showContentExpandToggle,
  contentExpanded,
  onToggleContentExpanded,
  authorName,
  authorPublicKey,
  authorIdentity,
  timestamp,
  replyingToName,
  hasParent,
  likes,
  dislikes,
  comments,
  liked,
  disliked,
  onPress,
  onAuthorPress,
  onReply,
  onReplyingToPress,
  onLike,
  onDislike,
  hideReplyingTo = false,
}: PostCardProps) {
  const { theme } = useTheme();
  const { hovered: replyingToHovered, onHoverIn, onHoverOut } = useWebHover();
  const {
    hovered: expandHovered,
    onHoverIn: onExpandHoverIn,
    onHoverOut: onExpandHoverOut,
  } = useWebHover();

  const avatarUrl = identiconUrl(authorPublicKey);
  const time = timeAgo(timestamp);

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
      onPress={onPress}
    >
      <View style={[Atoms.flex_row, Atoms.gap_md]}>
        <Avatar
          source={avatarUrl ? { uri: avatarUrl } : undefined}
          size="sm"
          onPress={onAuthorPress}
          disabled={!onAuthorPress}
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
              {onAuthorPress ? (
                <PostCardAuthorName name={authorName} onPress={onAuthorPress} />
              ) : (
                <Text
                  variant="secondary"
                  fontWeight="bold"
                  style={{ lineHeight: 18 }}
                >
                  {truncateName(authorName, 16)}
                </Text>
              )}

              <PubkeyTag
                publicKey={authorPublicKey}
                identity={authorIdentity}
                style={{ transform: [{ translateY: 1 }] }}
              />
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
              onPress={onReplyingToPress}
              disabled={!onReplyingToPress}
              onHoverIn={onReplyingToPress ? onHoverIn : undefined}
              onHoverOut={onReplyingToPress ? onHoverOut : undefined}
              style={{ alignSelf: 'flex-start', marginTop: 2 }}
            >
              <Text
                variant="small"
                style={[
                  theme.atoms.text_neutral_medium,
                  { lineHeight: 16 },
                  onReplyingToPress &&
                    replyingToHovered && { textDecorationLine: 'underline' },
                ]}
              >
                Replying to{' '}
                <Text
                  variant="small"
                  style={[
                    theme.atoms.text_neutral_high,
                    onReplyingToPress &&
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
              onPress={onToggleContentExpanded}
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
          Atoms.justify_around,
          { marginTop: 8, paddingLeft: 52 },
        ]}
      >
        <ActionButton
          icon="chatbubble-outline"
          count={comments}
          onPress={onReply}
          color={theme.palette.neutral_500}
        />
        <ActionButton
          icon={disliked ? 'arrow-down' : 'arrow-down-outline'}
          count={dislikes}
          onPress={onDislike}
          color={
            disliked ? theme.palette.negative_500 : theme.palette.neutral_500
          }
        />
        <ActionButton
          icon={liked ? 'arrow-up' : 'arrow-up-outline'}
          count={likes}
          onPress={onLike}
          color={liked ? theme.palette.primary_500 : theme.palette.neutral_500}
        />
      </View>
    </Pressable>
  );
}

function PostCardAuthorName({
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
