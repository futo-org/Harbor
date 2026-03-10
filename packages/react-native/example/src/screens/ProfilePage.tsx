import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Path } from 'react-native-svg';
import {
  usePolycentricContext,
  useProfileScreenData,
  useProfileEdit,
  truncateName,
  signedEventToHex,
} from '../hooks';
import { COLORS } from '../colors';
import { FeedPost } from '../components/Post';
import type { RootStackParamList } from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

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

export function ProfilePage({ route, navigation }: Props) {
  const { publicKey: publicKeyParam } = route.params;
  const { store } = usePolycentricContext();

  const data = useProfileScreenData(publicKeyParam);
  const edit = useProfileEdit(data.username, data.profile);

  const shownItems =
    data.activeFeed === 'posts' ? data.authorFeed.items : data.likesFeed.items;
  const loadingFeed =
    data.activeFeed === 'posts'
      ? data.authorFeed.isLoading
      : data.likesFeed.isLoading;
  const emptyFeedLabel =
    data.activeFeed === 'posts'
      ? data.isSelf
        ? 'No posts yet'
        : 'No posts from this profile yet'
      : 'No liked posts yet';

  const navigateToPost = (postId: string) => {
    const ps = store.getState().posts[postId];
    if (!ps) return;
    navigation.navigate('Post', {
      signedEventHex: signedEventToHex(ps.signedEvent),
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <BackIcon />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar */}
        <View style={styles.avatarSection}>
          {data.avatarUrl ? (
            <Image source={{ uri: data.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]} />
          )}
        </View>

        {/* Display name + Bio (combined edit) */}
        {edit.editing ? (
          <View style={styles.field}>
            <TextInput
              style={styles.editInput}
              value={edit.nameDraft}
              onChangeText={edit.setNameDraft}
              placeholder="Display name"
              placeholderTextColor={COLORS.inkSubtle}
              autoFocus
            />
            <TextInput
              style={[styles.editInput, styles.editInputMultiline]}
              value={edit.descriptionDraft}
              onChangeText={edit.setDescriptionDraft}
              placeholder="Tell people about yourself..."
              placeholderTextColor={COLORS.inkSubtle}
              multiline
            />
            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={edit.handleSave}
                disabled={edit.saving}
              >
                {edit.saving ? (
                  <ActivityIndicator size="small" color={COLORS.inkBold} />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelEditButton}
                onPress={edit.handleCancel}
              >
                <Text style={styles.cancelEditText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.field}>
              <View style={styles.displayRow}>
                <Text style={styles.displayName} numberOfLines={1}>
                  {truncateName(data.username, 24)}
                </Text>
                {data.isSelf && (
                  <TouchableOpacity onPress={() => edit.setEditing(true)}>
                    <Text style={styles.editLink}>Edit</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Pubkey */}
            <Text style={styles.pubkey}>{data.short}</Text>

            {/* Description */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Bio</Text>
              <View style={styles.displayRow}>
                {data.profile.isLoading ? (
                  <ActivityIndicator size="small" color={COLORS.inkSubtle} />
                ) : (
                  <Text style={styles.descriptionText}>
                    {data.profile.description ||
                      (data.isSelf ? 'No bio yet' : 'No bio')}
                  </Text>
                )}
              </View>
            </View>
          </>
        )}

        {!data.isSelf && (
          <TouchableOpacity
            style={[
              styles.followButton,
              data.followStatus.isFollowing && styles.followButtonActive,
            ]}
            onPress={data.followStatus.toggleFollow}
            disabled={data.followStatus.isLoading}
          >
            {data.followStatus.isLoading ? (
              <ActivityIndicator size="small" color={COLORS.inkBold} />
            ) : (
              <Text
                style={[
                  styles.followButtonText,
                  data.followStatus.isFollowing &&
                    styles.followButtonTextActive,
                ]}
              >
                {data.followStatus.isFollowing ? 'Following' : 'Follow'}
              </Text>
            )}
          </TouchableOpacity>
        )}

        <View style={styles.feedSection}>
          <View style={styles.feedTabs}>
            <TouchableOpacity
              style={[
                styles.feedTab,
                data.activeFeed === 'posts' && styles.feedTabActive,
              ]}
              onPress={() => data.setActiveFeed('posts')}
            >
              <Text
                style={[
                  styles.feedTabLabel,
                  data.activeFeed === 'posts' && styles.feedTabLabelActive,
                ]}
              >
                Posts
              </Text>
            </TouchableOpacity>

            {data.isSelf && (
              <TouchableOpacity
                style={[
                  styles.feedTab,
                  data.activeFeed === 'likes' && styles.feedTabActive,
                ]}
                onPress={() => data.setActiveFeed('likes')}
              >
                <Text
                  style={[
                    styles.feedTabLabel,
                    data.activeFeed === 'likes' && styles.feedTabLabelActive,
                  ]}
                >
                  Likes
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {loadingFeed ? (
            <View style={styles.feedLoading}>
              <ActivityIndicator size="small" color={COLORS.inkSubtle} />
            </View>
          ) : shownItems.length === 0 ? (
            <Text style={styles.feedEmptyText}>{emptyFeedLabel}</Text>
          ) : (
            <View style={styles.feedPosts}>
              {shownItems.map((postId) => (
                <FeedPost
                  key={postId}
                  postId={postId}
                  onPress={() => navigateToPost(postId)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
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
  scrollContent: {
    padding: 20,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: COLORS.bgHover,
  },
  avatarPlaceholder: {
    backgroundColor: COLORS.bgLowContrast,
  },
  field: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.inkSubtle,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  displayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  displayName: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.inkBold,
    flex: 1,
  },
  pubkey: {
    fontSize: 14,
    color: COLORS.inkSubtle,
    fontFamily: 'monospace',
    marginBottom: 24,
  },
  descriptionText: {
    fontSize: 16,
    lineHeight: 22,
    color: COLORS.ink,
    flex: 1,
  },
  editLink: {
    fontSize: 15,
    color: COLORS.primary,
    fontWeight: '600',
    marginLeft: 12,
  },
  editInput: {
    fontSize: 16,
    color: COLORS.ink,
    borderWidth: 1,
    borderColor: COLORS.bgLowContrast,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.bgHover,
    marginBottom: 12,
  },
  editInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    minWidth: 60,
    alignItems: 'center',
  },
  saveButtonText: {
    color: COLORS.inkBold,
    fontSize: 14,
    fontWeight: '600',
  },
  cancelEditButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cancelEditText: {
    color: COLORS.inkSubtle,
    fontSize: 14,
  },
  followButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 16,
    minWidth: 120,
    alignItems: 'center',
  },
  followButtonActive: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.bgLowContrast,
  },
  followButtonText: {
    color: COLORS.inkBold,
    fontSize: 15,
    fontWeight: '600',
  },
  followButtonTextActive: {
    color: COLORS.inkSubtle,
  },
  feedSection: {
    marginTop: 4,
    marginHorizontal: -20,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.bgHover,
  },
  feedTabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
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
  feedLoading: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  feedEmptyText: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    color: COLORS.inkSubtle,
    fontSize: 14,
  },
  feedPosts: {
    marginTop: 2,
  },
});
