import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Path } from 'react-native-svg';
import { types } from '@lib-polycentric/react-native';
import {
  usePolycentricContext,
  useCurrentIdentity,
  useReplies,
  decodePostEvent,
  getIdentityId,
  identiconUrl,
  hexToBytes,
} from '../hooks';
import type { PostData } from '../hooks';
import { FeedPost } from '../components/Post';
import { ReplyItem } from '../components/ReplyItem';
import { ComposeModal } from '../components/ComposeModal';
import type { ReplyTo } from '../components/ComposeModal';
import { COLORS } from '../colors';
import type { RootStackParamList } from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Post'>;

const BackIcon = ({ size = 24, color = COLORS.ink }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      stroke={color}
      d="M15.75 19.5L8.25 12l7.5-7.5"
    />
  </Svg>
);

export function PostPage({ route, navigation }: Props) {
  const { signedEventHex } = route.params;
  const { store } = usePolycentricContext();
  const { identity } = useCurrentIdentity();

  const signedEvent = useMemo(
    () => types.SignedEvent.decode(hexToBytes(signedEventHex)),
    [signedEventHex]
  );

  const postData = useMemo(() => decodePostEvent(signedEvent), [signedEvent]);

  // Ensure the post is in the zustand store
  const postId = useMemo(() => {
    if (!postData) return undefined;
    store.getState().ingestPost(postData.id, signedEvent, postData);
    return postData.id;
  }, [postData, signedEvent, store]);

  const pointer = useMemo(
    () => (postId ? (store.getState().posts[postId]?.pointer ?? null) : null),
    [store, postId]
  );

  // Use the replies hook when we have a pointer
  const repliesHook = useReplies(pointer ?? types.Pointer.create());

  const [composeVisible, setComposeVisible] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);

  const openReplyToPost = useCallback(() => {
    if (!postData || !pointer) return;
    setReplyTo({
      authorName: getIdentityId(postData.authorPublicKey),
      content: postData.content,
      pointer,
    });
    setComposeVisible(true);
  }, [postData, pointer]);

  const openReplyToReply = useCallback(
    (reply: PostData) => {
      const replyState = store.getState().posts[reply.id];
      setReplyTo({
        authorName: getIdentityId(reply.authorPublicKey),
        content: reply.content,
        pointer: replyState?.pointer ?? types.Pointer.create(),
      });
      setComposeVisible(true);
    },
    [store]
  );

  const handlePostCreated = useCallback(
    (_newReply: types.SignedEvent) => {
      setComposeVisible(false);
      setReplyTo(null);
      repliesHook.refresh();
      if (postId) {
        store.getState().ensurePostMetadataLoaded(postId);
      }
    },
    [postId, store, repliesHook]
  );

  // Ingest reply events into the store so ReplyItem can look them up
  const replyPostIds = useMemo(() => {
    const ids: string[] = [];
    for (const reply of repliesHook.items) {
      const decoded = decodePostEvent(reply);
      if (decoded) {
        store.getState().ingestPost(decoded.id, reply, decoded);
        ids.push(decoded.id);
      }
    }
    return ids;
  }, [repliesHook.items, store]);

  const currentPubkey = identity?.keyPair.publicKey;

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <BackIcon />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Post</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scrollView}>
        {postId ? (
          <>
            <FeedPost postId={postId} onReply={openReplyToPost} />

            <View style={styles.repliesSection}>
              <Text style={styles.repliesLabel}>Replies</Text>
              {replyPostIds.length === 0 ? (
                <Text style={styles.repliesPlaceholder}>No replies yet</Text>
              ) : (
                replyPostIds.map((replyId) => (
                  <ReplyItem
                    key={replyId}
                    postId={replyId}
                    navigation={navigation}
                    onReply={openReplyToReply}
                  />
                ))
              )}
            </View>
          </>
        ) : (
          <View style={styles.notFound}>
            <Text style={styles.notFoundText}>Post not found</Text>
          </View>
        )}
      </ScrollView>

      <ComposeModal
        visible={composeVisible}
        onClose={() => {
          setComposeVisible(false);
          setReplyTo(null);
        }}
        onPostCreated={handlePostCreated}
        replyTo={replyTo}
        user={
          currentPubkey
            ? {
                username: getIdentityId(currentPubkey),
                avatarUrl: identiconUrl(currentPubkey),
              }
            : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bgHover,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.inkBold,
  },
  scrollView: {
    flex: 1,
  },
  repliesSection: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.bgHover,
  },
  repliesLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.inkBold,
    marginBottom: 12,
  },
  repliesPlaceholder: {
    fontSize: 14,
    color: COLORS.inkSubtle,
  },
  notFound: {
    padding: 32,
    alignItems: 'center',
  },
  notFoundText: {
    fontSize: 16,
    color: COLORS.inkSubtle,
  },
});
