import { useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Pressable,
  Keyboard,
  StyleSheet,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { types } from '@polycentric/react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS } from '../colors';
import type { RootStackParamList } from '../App';
import { usePolycentricContext, useUsername, usePostState } from '../hooks';
import {
  eventKey,
  getIdentityId,
  identiconUrl,
  publicKeyToStringURLSafe,
  timeAgo,
  truncateName,
  signedEventToHex,
} from '../hooks';
import type { PostData } from '../hooks';

const EMPTY_PUBKEY = types.PublicKey.create();

export interface PostProps {
  authorName: string;
  authorPubkey: string;
  avatarUrl?: string;
  publishedAtLabel?: string;
  content: string;
  replyingToName?: string;
  liked?: boolean;
  disliked?: boolean;
  likes?: number;
  dislikes?: number;
  comments?: number;
  onPress?: () => void;
  onReply?: () => void;
  onLike?: () => void;
  onDislike?: () => void;
  avatarProfileRoute?: RootStackParamList['Profile'];
  onReplyingToPress?: () => void;
}

/** Wrapper that renders a post by its store ID. */
export function FeedPost({
  postId,
  onPress,
  onReply,
  hideReplyingTo,
}: {
  postId: string;
  onPress?: () => void;
  onReply?: (post: PostData) => void;
  hideReplyingTo?: boolean;
}) {
  const { client, store } = usePolycentricContext();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const { state, handleLike, handleDislike } = usePostState(postId);
  const decoded = state?.decoded;

  const short = decoded ? getIdentityId(decoded.authorPublicKey) : '';
  const avatar = decoded ? identiconUrl(decoded.authorPublicKey) : '';

  const authorName = useUsername(decoded?.authorPublicKey ?? EMPTY_PUBKEY);
  const replyingToName = useUsername(
    decoded?.parentAuthorPublicKey ?? EMPTY_PUBKEY
  );
  const hasParent = !!decoded?.parentAuthorPublicKey;

  const liked = state?.myOpinion === types.Opinion.LIKE;
  const disliked = state?.myOpinion === types.Opinion.DISLIKE;

  const handleReplyingToPress = useCallback(async () => {
    if (
      !decoded?.parentAuthorPublicKey?.key ||
      !decoded.parentProcess?.process ||
      decoded.parentLogicalClock == null
    )
      return;

    const parentId = eventKey(
      decoded.parentAuthorPublicKey.key,
      decoded.parentProcess.process,
      decoded.parentLogicalClock
    );

    // Check store first (instant if parent was already seen on screen)
    const cached = store.getState().posts[parentId];
    if (cached) {
      const hex = signedEventToHex(cached.signedEvent);
      navigation.push('Post', { signedEventHex: hex });
      return;
    }

    // Fallback: fetch from network
    try {
      const feed = client.queryManager.queryAuthorFeed(
        decoded.parentAuthorPublicKey
      );
      const items = await feed.read();
      for (const item of items) {
        const ev = types.Event.decode(item.event ?? new Uint8Array());
        if (Number(ev.logicalClock) === decoded.parentLogicalClock) {
          const hex = signedEventToHex(item);
          navigation.push('Post', { signedEventHex: hex });
          return;
        }
      }
    } catch {}
  }, [decoded, client, store, navigation]);

  if (!decoded || !state) return null;

  return (
    <Post
      authorName={authorName}
      authorPubkey={short}
      avatarUrl={avatar}
      content={decoded.content}
      publishedAtLabel={timeAgo(decoded.timestamp)}
      replyingToName={hideReplyingTo || !hasParent ? undefined : replyingToName}
      liked={liked}
      disliked={disliked}
      likes={state.stats.likes}
      dislikes={state.stats.dislikes}
      comments={state.stats.comments}
      onPress={onPress}
      onReply={onReply ? () => onReply(decoded) : undefined}
      onLike={handleLike}
      onDislike={handleDislike}
      onReplyingToPress={
        decoded?.parentAuthorPublicKey ? handleReplyingToPress : undefined
      }
      avatarProfileRoute={{
        publicKey: publicKeyToStringURLSafe(decoded.authorPublicKey),
      }}
    />
  );
}

const LikeIconOutline = ({ size = 24, color = COLORS.ink }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      stroke={color}
      d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75 2.25 2.25 0 012.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2.25M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.203 4.167 9.75 5 9.75h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z"
    />
  </Svg>
);

const LikeIconSolid = ({ size = 24, color = COLORS.primary }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M2.75781 15.5186C2.79393 16.5133 2.95856 17.4998 3.24902 18.4531C3.43356 19.0587 4.03652 19.4668 4.74316 19.4668H5.65137C5.6664 19.4667 5.6761 19.4633 5.68457 19.458C5.69468 19.4517 5.70746 19.4395 5.71875 19.4199C5.74284 19.3778 5.74462 19.329 5.72559 19.29L5.71777 19.2725L5.44824 18.6709L5.44531 18.6631L5.44141 18.6543C5.05143 17.6913 4.81566 16.6502 4.7627 15.5615L4.75098 15.0918C4.7484 13.3555 5.22369 11.652 6.125 10.168C6.14871 10.1289 6.15213 10.0738 6.12598 10.0225C6.1139 9.99884 6.0999 9.98395 6.08887 9.97656C6.07984 9.97058 6.06915 9.9668 6.05273 9.9668H5C4.33867 9.9668 3.76485 10.3241 3.5459 10.8779C3.03268 12.1824 2.75 13.603 2.75 15.0918L2.75781 15.5186Z" />
    <Path d="M6.63299 10.2168C7.43899 10.2168 8.16599 9.7708 8.66399 9.1368C9.44024 8.14641 10.4147 7.32898 11.525 6.7368C12.248 6.3528 12.875 5.7808 13.178 5.0218C13.3908 4.49005 13.5001 3.92255 13.5 3.3498V2.7168C13.5 2.51788 13.579 2.32712 13.7197 2.18647C13.8603 2.04581 14.0511 1.9668 14.25 1.9668C14.8467 1.9668 15.419 2.20385 15.841 2.62581C16.2629 3.04776 16.5 3.62006 16.5 4.2168C16.5 5.3688 16.24 6.4598 15.777 7.4348C15.511 7.9928 15.884 8.7168 16.502 8.7168H19.628C20.654 8.7168 21.573 9.4108 21.682 10.4318C21.727 10.8538 21.75 11.2818 21.75 11.7168C21.7541 14.4531 20.819 17.108 19.101 19.2378C18.713 19.7198 18.114 19.9668 17.496 19.9668H13.48C12.997 19.9668 12.516 19.8888 12.057 19.7368L8.94299 18.6968C8.48409 18.5442 8.0036 18.5003 7.51999 18.4668L6.17554 18.4395H5.90243C5.48043 17.3975 5.25099 16.2858 5.25099 15.0918C5.24841 13.4467 5.69888 11.8327 6.55299 10.4268L6.63299 10.2168Z" />
  </Svg>
);

const DislikeIconOutline = ({ size = 24, color = COLORS.ink }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      stroke={color}
      d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a8.96 8.96 0 01-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398C20.613 14.547 19.833 15 19 15h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 00.303-.54m.023-8.25H16.48a4.5 4.5 0 01-1.423-.23l-3.114-1.04a4.5 4.5 0 00-1.423-.23H6.504c-.618 0-1.217.247-1.605.729A11.95 11.95 0 002.25 12c0 .434.023.863.068 1.285C2.427 14.306 3.346 15 4.372 15h3.126c.618 0 .991.724.725 1.282A7.471 7.471 0 007.5 19.5a2.25 2.25 0 002.25 2.25.75.75 0 00.75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 002.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384"
    />
  </Svg>
);

const DislikeIconSolid = ({ size = 24, color = COLORS.inkSubtle }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M21.4922 10.4482C21.4561 9.4535 21.2914 8.467 21.001 7.5137C20.8164 6.9081 20.2135 6.5 19.5068 6.5H18.5986C18.5836 6.5001 18.5739 6.5035 18.5654 6.5088C18.5553 6.5151 18.5425 6.5273 18.5312 6.5469C18.5072 6.589 18.5054 6.6378 18.5244 6.6768L18.5322 6.6943L18.8018 7.2959L18.8047 7.3037L18.8086 7.3125C19.1986 8.2755 19.4343 9.3166 19.4873 10.4053L19.499 10.875C19.5016 12.6113 19.0263 14.3148 18.125 15.7988C18.1013 15.8379 18.0979 15.893 18.124 15.9443C18.1361 15.968 18.1501 15.9829 18.1611 15.9902C18.1702 15.9962 18.1808 16 18.1973 16H19.25C19.9113 16 20.4851 15.6427 20.7041 15.0889C21.2173 13.7844 21.5 12.3638 21.5 10.875L21.4922 10.4482Z" />
    <Path d="M17.617 15.75C16.811 15.75 16.084 16.196 15.586 16.83C14.8098 17.8204 13.8353 18.6378 12.725 19.23C12.002 19.614 11.375 20.186 11.072 20.945C10.8592 21.4767 10.7499 22.0442 10.75 22.617V23.25C10.75 23.4489 10.671 23.6397 10.5303 23.7803C10.3897 23.921 10.1989 24 10 24C9.4033 24 8.831 23.763 8.409 23.341C7.9871 22.919 7.75 22.3467 7.75 21.75C7.75 20.598 8.01 19.507 8.473 18.532C8.739 17.974 8.366 17.25 7.748 17.25H4.622C3.596 17.25 2.677 16.556 2.568 15.535C2.523 15.113 2.5 14.685 2.5 14.25C2.4959 11.5137 3.431 8.8588 5.149 6.729C5.537 6.247 6.136 6 6.754 6H10.77C11.253 6 11.734 6.078 12.193 6.23L15.307 7.27C15.7659 7.4226 16.2464 7.5003 16.73 7.5L18.0745 7.5273H18.3476C18.7696 8.5693 18.999 9.681 18.999 10.875C19.0016 12.5201 18.5511 14.1341 17.697 15.54L17.617 15.75Z" />
  </Svg>
);

const CommentIconOutline = ({ size = 24, color = COLORS.ink }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      stroke={color}
      d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z"
    />
  </Svg>
);

interface ActionButtonProps {
  icon: React.ReactNode;
  count?: number;
  onPress?: () => void;
}

const ActionButton = ({ icon, count, onPress }: ActionButtonProps) => (
  <TouchableOpacity style={styles.actionButton} onPress={onPress}>
    {icon}
    <Text style={styles.actionCount}>{count ? count : ' '}</Text>
  </TouchableOpacity>
);

export const Post = ({
  authorName,
  authorPubkey,
  avatarUrl,
  publishedAtLabel,
  content,
  replyingToName,
  liked,
  disliked,
  likes,
  dislikes,
  comments,
  onPress,
  onReply,
  onLike,
  onDislike,
  avatarProfileRoute,
  onReplyingToPress,
}: PostProps) => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handleAvatarPress = () => {
    if (!avatarProfileRoute) return;
    navigation.navigate('Profile', avatarProfileRoute);
  };

  return (
    <Pressable
      style={styles.container}
      onPress={onPress ?? (() => Keyboard.dismiss())}
    >
      <View style={styles.row}>
        <TouchableOpacity
          onPress={handleAvatarPress}
          disabled={!avatarProfileRoute}
          activeOpacity={0.7}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]} />
          )}
        </TouchableOpacity>

        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.authorRow}>
              <Text style={styles.authorName} numberOfLines={1}>
                {truncateName(authorName, 16)}
              </Text>
              <Text style={styles.authorPubkey} numberOfLines={1}>
                {authorPubkey}
              </Text>
            </View>
            {publishedAtLabel && (
              <Text style={styles.timestamp}>{publishedAtLabel}</Text>
            )}
          </View>

          {replyingToName && (
            <View style={styles.subheader}>
              <TouchableOpacity
                onPress={onReplyingToPress}
                disabled={!onReplyingToPress}
              >
                <Text style={styles.replyText}>
                  Replying to{' '}
                  <Text style={styles.replyName}>
                    {truncateName(replyingToName, 16)}
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.postContent}>{content}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <ActionButton
          icon={<CommentIconOutline size={22} />}
          count={comments}
          onPress={onReply}
        />
        <ActionButton
          icon={
            disliked ? (
              <DislikeIconSolid size={22} />
            ) : (
              <DislikeIconOutline size={22} />
            )
          }
          count={dislikes}
          onPress={onDislike}
        />
        <ActionButton
          icon={
            liked ? <LikeIconSolid size={22} /> : <LikeIconOutline size={22} />
          }
          count={likes}
          onPress={onLike}
        />
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.bg,
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bgLowContrast,
  },
  row: {
    flexDirection: 'row',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.bgHover,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: COLORS.bgLowContrast,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  authorRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  authorName: {
    fontWeight: '700',
    fontSize: 15,
    color: COLORS.inkBold,
  },
  authorPubkey: {
    fontSize: 13,
    color: COLORS.inkSubtle,
    fontFamily: 'monospace',
  },
  timestamp: {
    fontSize: 13,
    color: COLORS.inkSubtle,
    marginLeft: 8,
  },
  subheader: {
    marginTop: 2,
  },
  replyText: {
    fontSize: 13,
    color: COLORS.ink,
  },
  replyName: {
    color: COLORS.inkSubtle,
  },
  postContent: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 22,
    color: COLORS.ink,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
    paddingLeft: 60,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionCount: {
    fontSize: 13,
    color: COLORS.inkSubtle,
    minWidth: 28,
  },
});
