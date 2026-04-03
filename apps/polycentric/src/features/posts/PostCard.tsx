import { Pressable, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Box } from '@/src/common/components/layouts';
import { Avatar, Text, PubkeyTag } from '@/src/common/components/primitives';
import { types } from '@polycentric/react-native';
import {
  timeAgo,
  identiconUrl,
  truncateName,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';

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
  const { theme } = useTheme();

  const avatarUrl = identiconUrl(authorPublicKey);
  const time = timeAgo(timestamp);

  return (
    <Pressable
      style={[
        styles.container,
        { borderBottomColor: withHexOpacity(theme.palette.neutral_500, '20') },
      ]}
      onPress={onPress}
    >
      <Box style={[Atoms.flex_row, Atoms.gap_md]}>
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

        <Box style={Atoms.flex_1}>
          {/* Header: name + pubkey | timestamp */}
          <Box
            style={[
              Atoms.flex_row,
              Atoms.justify_between,
              { alignItems: 'baseline', marginTop: -1 },
            ]}
          >
            <Box
              style={[
                Atoms.flex_1,
                Atoms.flex_row,
                Atoms.gap_xs,
                { alignItems: 'baseline' },
              ]}
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
                color="neutral_500"
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
                style={{
                  lineHeight: 16,
                  color: withHexOpacity(theme.palette.neutral_500, '80'),
                }}
              >
                Replying to{' '}
                <Text variant="small" color="neutral_500">
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
              <Text variant="small" color="primary_500">
                {contentExpanded ? 'Show less' : 'Show more'}
              </Text>
            </TouchableOpacity>
          )}
        </Box>
      </Box>

      {/* Actions */}
      <Box
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
        color="neutral_500"
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
