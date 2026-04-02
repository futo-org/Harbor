import { Pressable, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Box } from '@/src/common/components/layouts';
import { Avatar, Text, PubkeyTag } from '@/src/common/components/primitives';
import { types } from '@polycentric/react-native';
import { timeAgo, identiconUrl, truncateName } from '@/src/common/lib/polycentric-hooks';
import { useLegacyTheme } from '@/src/common/legacyTheme';

export interface PostCardProps {
  displayContent: string;
  isTruncatedPreview: boolean;
  showContentExpandToggle: boolean;
  contentExpanded: boolean;
  onToggleContentExpanded: () => void;
  authorName: string;
  authorPublicKey: types.PublicKey;
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
  const { legacyTheme } = useLegacyTheme();

  const avatarUrl = identiconUrl(authorPublicKey);
  const time = timeAgo(timestamp);

  return (
    <Pressable
      style={[
        styles.container,
        { borderBottomColor: legacyTheme.colors.neutralSurfaceOpacity20 },
      ]}
      onPress={onPress}
    >
      <Box flexDirection="row" gap="md">
        <Pressable
          onPress={onAuthorPress}
          disabled={!onAuthorPress}
          style={{ marginTop: 3 }}
        >
          <Avatar
            source={avatarUrl ? { uri: avatarUrl } : undefined}
            size="sm"
          />
        </Pressable>

        <Box flex={1}>
          {/* Header: name + pubkey | timestamp */}
          <Box
            flexDirection="row"
            justifyContent="space-between"
            style={{ alignItems: 'baseline', marginTop: -1 }}
          >
            <Box
              flex={1}
              flexDirection="row"
              gap="xs"
              style={{ alignItems: 'baseline' }}
            >
              <Pressable onPress={onAuthorPress} disabled={!onAuthorPress}>
                <Text
                  variant="secondary"
                  fontWeight="bold"
                  style={{ lineHeight: 18 }}
                >
                  {truncateName(authorName, 16)}
                </Text>
              </Pressable>

              <PubkeyTag
                publicKey={authorPublicKey}
                style={{ transform: [{ translateY: 1 }] }}
              />
            </Box>

            {time ? (
              <Text
                variant="small"
                color="neutralSurface"
                style={{ lineHeight: 18, marginLeft: 8 }}
              >
                {time}
              </Text>
            ) : null}
          </Box>

          {/* Replying to */}
          {!hideReplyingTo && hasParent && (
            <TouchableOpacity
              onPress={onReplyingToPress}
              disabled={!onReplyingToPress}
              style={{ marginTop: 6 }}
            >
              <Text
                variant="small"
                color="neutralSurfaceOpacity80"
                style={{ lineHeight: 16 }}
              >
                Replying to{' '}
                <Text variant="small" color="neutralSurface">
                  {truncateName(replyingToName, 16)}
                </Text>
              </Text>
            </TouchableOpacity>
          )}

          {/* Content */}
          <Text variant="secondary" style={{ marginTop: 4, lineHeight: 20 }}>
            {displayContent}
            {isTruncatedPreview ? '...' : ''}
          </Text>
          {showContentExpandToggle && (
            <TouchableOpacity
              onPress={onToggleContentExpanded}
              style={{ marginTop: 2 }}
            >
              <Text variant="small" color="primary">
                {contentExpanded ? 'Show less' : 'Show more'}
              </Text>
            </TouchableOpacity>
          )}
        </Box>
      </Box>

      {/* Actions */}
      <Box
        flexDirection="row"
        justifyContent="space-around"
        style={{ marginTop: 8, paddingLeft: 52 }}
      >
        <ActionButton
          icon="chatbubble-outline"
          count={comments}
          onPress={onReply}
          color={legacyTheme.colors.neutralSurface}
        />
        <ActionButton
          icon={disliked ? 'arrow-down' : 'arrow-down-outline'}
          count={dislikes}
          onPress={onDislike}
          color={
            disliked
              ? legacyTheme.colors.destructive
              : legacyTheme.colors.neutralSurface
          }
        />
        <ActionButton
          icon={liked ? 'arrow-up' : 'arrow-up-outline'}
          count={likes}
          onPress={onLike}
          color={
            liked
              ? legacyTheme.colors.primary
              : legacyTheme.colors.neutralSurface
          }
        />
      </Box>
    </Pressable>
  );
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
  return (
    <TouchableOpacity
      style={styles.actionButton}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <Ionicons name={icon} size={16} color={color} />
      <Text
        variant="small"
        color="neutralSurface"
        style={{ lineHeight: 16, minWidth: 28 }}
      >
        {count ? String(count) : ' '}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 15,
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minHeight: 20,
  },
});
