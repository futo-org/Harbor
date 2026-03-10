import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { types } from '@lib-polycentric/react-native';
import {
  usePolycentricContext,
  useExploreFeed,
  useFollowingFeed,
  useCurrentIdentity,
  useUsername,
  decodePostEvent,
  getIdentityId,
  identiconUrl,
  signedEventToHex,
} from '../hooks';
import type { PostData } from '../hooks';
import { COLORS } from '../colors';
import { FeedPost } from '../components/Post';
import { ComposeModal } from '../components/ComposeModal';
import type { ReplyTo } from '../components/ComposeModal';
import { PlaceholderLogo } from '../components/PlaceholderLogo';
import { SettingsView } from './SettingsView';
import type { RootStackParamList } from '../App';

const CogIcon = ({ size = 20, color = COLORS.inkSubtle }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
    />
    <Path
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
    />
  </Svg>
);

const EMPTY_PUBKEY = types.PublicKey.create();

export function HomePage() {
  const { store } = usePolycentricContext();
  const { identity } = useCurrentIdentity();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const currentPubkey = identity?.keyPair.publicKey;
  const username = useUsername(currentPubkey ?? EMPTY_PUBKEY);

  const [feedMode, setFeedMode] = useState<
    'explore' | 'following' | 'settings'
  >('explore');

  const exploreFeed = useExploreFeed();
  const followingFeed = useFollowingFeed();

  const activeFeed = feedMode === 'explore' ? exploreFeed : followingFeed;
  const activeFeedKey = feedMode === 'explore' ? 'explore' : 'following';

  const [composeVisible, setComposeVisible] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);

  const handlePostCreated = useCallback(
    (signedEvent: types.SignedEvent) => {
      const decoded = decodePostEvent(signedEvent);
      if (decoded) {
        store.getState().ingestPost(decoded.id, signedEvent, decoded);
        store.getState().prependFeed(activeFeedKey, decoded.id);
      }
    },
    [store, activeFeedKey]
  );

  const navigateToPost = useCallback(
    (postId: string) => {
      const ps = store.getState().posts[postId];
      if (!ps) return;
      navigation.navigate('Post', {
        signedEventHex: signedEventToHex(ps.signedEvent),
      });
    },
    [store, navigation]
  );

  const openReply = useCallback(
    (post: PostData) => {
      setReplyTo({
        authorName: getIdentityId(post.authorPublicKey),
        content: post.content,
        pointer:
          store.getState().posts[post.id]?.pointer ?? types.Pointer.create(),
      });
      setComposeVisible(true);
    },
    [store]
  );

  const renderItem = useCallback(
    ({ item: postId }: { item: string }) => (
      <FeedPost
        postId={postId}
        onPress={() => navigateToPost(postId)}
        onReply={openReply}
      />
    ),
    [navigateToPost, openReply]
  );

  const keyExtractor = useCallback((item: string) => item, []);

  const avatarUrl = currentPubkey ? identiconUrl(currentPubkey) : undefined;

  const composeUser = {
    username,
    avatarUrl,
  };

  const feedTabsHeader = (
    <View style={styles.feedTabs}>
      <TouchableOpacity
        style={[styles.feedTab, feedMode === 'explore' && styles.feedTabActive]}
        onPress={() => setFeedMode('explore')}
      >
        <Text
          style={[
            styles.feedTabLabel,
            feedMode === 'explore' && styles.feedTabLabelActive,
          ]}
        >
          Explore
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.feedTab,
          feedMode === 'following' && styles.feedTabActive,
        ]}
        onPress={() => setFeedMode('following')}
      >
        <Text
          style={[
            styles.feedTabLabel,
            feedMode === 'following' && styles.feedTabLabelActive,
          ]}
        >
          Following
        </Text>
      </TouchableOpacity>
      <View style={styles.feedTabsSpacer} />
      <TouchableOpacity
        style={styles.cogButton}
        onPress={() =>
          setFeedMode(feedMode === 'settings' ? 'explore' : 'settings')
        }
      >
        <CogIcon
          color={feedMode === 'settings' ? COLORS.inkBold : COLORS.inkSubtle}
        />
      </TouchableOpacity>
    </View>
  );

  if (feedMode === 'settings') {
    return (
      <>
        {feedTabsHeader}
        <SettingsView />
      </>
    );
  }

  return (
    <>
      {feedTabsHeader}
      <FlatList
        data={activeFeed.items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        onEndReached={activeFeed.loadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={undefined}
        ListFooterComponent={
          activeFeed.hasMore && activeFeed.items.length > 0 ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator size="small" color={COLORS.inkSubtle} />
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          !activeFeed.isLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                {feedMode === 'following'
                  ? 'Not following anyone yet'
                  : 'No posts yet'}
              </Text>
            </View>
          ) : (
            <PlaceholderLogo />
          )
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          setReplyTo(null);
          setComposeVisible(true);
        }}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <ComposeModal
        visible={composeVisible}
        onClose={() => {
          setComposeVisible(false);
          setReplyTo(null);
        }}
        onPostCreated={(signedEvent) => {
          setComposeVisible(false);
          setReplyTo(null);
          handlePostCreated(signedEvent);
        }}
        replyTo={replyTo}
        user={composeUser}
      />
    </>
  );
}

const styles = StyleSheet.create({
  feedTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  feedTabsSpacer: {
    flex: 1,
  },
  cogButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.bgLowContrast,
    backgroundColor: COLORS.bg,
  },
  feedTabActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.bgHover,
  },
  feedTabLabel: {
    color: COLORS.inkSubtle,
    fontSize: 13,
    fontWeight: '600',
  },
  feedTabLabelActive: {
    color: COLORS.inkBold,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 80,
  },
  loadingMore: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    color: COLORS.inkSubtle,
    fontSize: 15,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.overlay,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  fabText: {
    color: COLORS.inkBold,
    fontSize: 32,
    fontWeight: '300',
    marginTop: -2,
  },
});
