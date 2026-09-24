import Icon from '@/src/common/components/Icon';
import { List } from '@/src/common/components/List';
import { ListEmpty } from '@/src/common/components/ListEmpty';
import { PagerView } from '@/src/common/components/PagerView';
import {
  TabFilterSheet,
  type TabFilterOption,
} from '@/src/common/components/tabs';
import { Tabs } from '@/src/common/components/tabs';
import { TOPBAR_HEIGHT } from '@/src/common/components/layout/Topbar';
import { Text } from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { isIOS, isWeb } from '@/src/common/util/platform';
import FollowButton from '@/src/features/follow/FollowButton';
import { ProfileRow } from '@/src/features/profile/ProfileRow';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FeedPage } from '../feed/FeedPage';
import { useSearchPosts, type PostSearchSort } from './hooks/useSearchPosts';
import { type UserSearchEntry, useSearchUsers } from './hooks/useSearchUsers';

export type SearchTab = 'top' | 'popular' | 'latest' | 'people';

const SEARCH_TAB_VALUES: readonly SearchTab[] = ['top', 'people'];

const SORT_POSTS_OPTIONS: readonly TabFilterOption<SearchTab>[] = [
  { value: 'top', label: 'Top', icon: 'rocket' },
  { value: 'popular', label: 'Popular', icon: 'reactionOutline' },
  { value: 'latest', label: 'Latest', icon: 'star' },
];

const SEARCH_TABS: readonly {
  value: SearchTab;
  label: string;
  menu_options?: readonly TabFilterOption<SearchTab>[];
}[] = [
  { value: 'top', label: 'Posts', menu_options: SORT_POSTS_OPTIONS },
  { value: 'people', label: 'People' },
];

function PostResultsPage({
  query,
  sort,
  active,
}: {
  query: string;
  sort: PostSearchSort;
  /** True for the page being shown; only that page queries. */
  active: boolean;
}) {
  const feed = useSearchPosts(query, { sort, enabled: active });
  return (
    <FeedPage
      feed={feed}
      active={active}
      emptyMessage="No posts found."
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    />
  );
}

function PeopleResultsPage({
  query,
  active,
}: {
  query: string;
  active: boolean;
}) {
  const users = useSearchUsers(query, { enabled: active });
  return <UserResults users={users} refreshable showEmpty={active} />;
}

export function SearchResults({
  phrase,
  query,
  submitted,
  tab,
  onTabChange,
  onSubmitQuery,
  topbar,
}: {
  /** The trimmed text currently in the input. */
  phrase: string;
  /** The (debounced or submitted) term the result queries run with. */
  query: string;
  /** Typing shows a people typeahead; submitting shows the full search. */
  submitted: boolean;
  tab: SearchTab;
  onTabChange: (tab: SearchTab) => void;
  onSubmitQuery: () => void;
  /** Rendered inside the pager's hiding header so it hides on scroll. */
  topbar?: ReactElement;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  // Result pages own their queries; this one backs the typeahead shown while
  // the phrase is still being typed.
  const users = useSearchUsers(query, { enabled: !submitted });

  if (!phrase) {
    return (
      <View style={Atoms.flex_1}>
        {topbar}
        <KeyboardAvoidingView
          behavior={isIOS ? 'padding' : 'height'}
          keyboardVerticalOffset={insets.top + TOPBAR_HEIGHT}
          style={Atoms.flex_1}
        >
          <View
            style={[
              Atoms.flex_1,
              Atoms.items_center,
              Atoms.justify_start,
              Atoms.pt_xl,
            ]}
          >
            <Text color="neutral_500">Search for posts and people.</Text>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // While typing, the topbar stays static: putting it in the lists'
  // hiding header would remount the input per view switch and drop the
  // keyboard mid-typing.
  if (!submitted) {
    return (
      <View style={Atoms.flex_1}>
        {topbar}
        <UserResults
          users={users}
          header={<SearchPhraseRow phrase={phrase} onPress={onSubmitQuery} />}
          showEmpty={phrase === query}
        />
      </View>
    );
  }

  const renderTabBar = ({
    dragProgress,
  }: {
    dragProgress: SharedValue<number>;
  }) => (
    <View style={{ backgroundColor: theme.palette.neutral_0 }}>
      {topbar}
      <Tabs progress={dragProgress}>
        {SEARCH_TABS.map(({ value, label, menu_options }) => (
          <Tabs.Tab
            key={value}
            active={
              value === tab || menu_options?.some(({ value }) => value === tab)
            }
            onPress={() => onTabChange(value)}
            menu={
              menu_options
                ? ({ open, onClose }) => (
                    <TabFilterSheet
                      open={open}
                      onClose={onClose}
                      title="Sort by"
                      options={menu_options}
                      selected={tab}
                      onChange={(value) => {
                        onTabChange(value);
                        onClose();
                      }}
                    />
                  )
                : undefined
            }
          >
            {label}
          </Tabs.Tab>
        ))}
      </Tabs>
    </View>
  );

  const sortPost = (SORT_POSTS_OPTIONS.find(({ value }) => value === tab)
    ?.value || 'top') as PostSearchSort;

  return (
    <PagerView
      values={SEARCH_TAB_VALUES}
      active={tab}
      onChange={onTabChange}
      renderTabBar={renderTabBar}
    >
      <PostResultsPage
        query={query}
        sort={sortPost}
        active={tab !== 'people'}
      />
      <PeopleResultsPage query={query} active={tab === 'people'} />
    </PagerView>
  );
}

export function SearchPhraseRow({
  phrase,
  onPress,
}: {
  phrase: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Search for ${phrase}`}
      onPress={onPress}
      style={({ hovered, pressed }) => [
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.gap_md,
        Atoms.px_lg,
        Atoms.py_lg,
        { borderBottomWidth: 1, borderColor: theme.palette.neutral_25 },
        (hovered || pressed) && { backgroundColor: theme.palette.neutral_25 },
      ]}
    >
      <Icon name="search" size={16} color="neutral_500" />
      <Text fontWeight="bold" numberOfLines={1} style={Atoms.flex_1}>
        {phrase}
      </Text>
    </Pressable>
  );
}

function UserResults({
  users,
  header,
  showEmpty = true,
  refreshable = false,
}: {
  users: ReturnType<typeof useSearchUsers>;
  header?: ReactElement;
  showEmpty?: boolean;
  refreshable?: boolean;
}) {
  const { theme } = useTheme();

  return (
    <List<UserSearchEntry>
      data={users.entries}
      keyExtractor={(entry) => entry.identity}
      renderItem={({ item }) => <UserRow identity={item.identity} />}
      ListHeaderComponent={header}
      refreshControl={
        refreshable && !isWeb ? (
          <RefreshControl
            refreshing={users.isRefreshing}
            onRefresh={users.refresh}
          />
        ) : undefined
      }
      ListEmptyComponent={
        users.isLoading ? (
          <View style={[Atoms.items_center, Atoms.p_lg]}>
            <ActivityIndicator
              size="small"
              color={theme.palette.neutral_500}
              accessibilityLabel="Searching"
            />
          </View>
        ) : showEmpty ? (
          <ListEmpty>No people found.</ListEmpty>
        ) : null
      }
      ListFooterComponent={
        users.hasMore && users.entries.length > 0 ? (
          <View style={[Atoms.items_center, Atoms.p_lg]}>
            <ActivityIndicator
              size="small"
              color={theme.palette.neutral_500}
              accessibilityLabel="Loading more"
            />
          </View>
        ) : null
      }
      onEndReached={users.hasMore ? users.loadMore : undefined}
      onEndReachedThreshold={0.5}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
    />
  );
}

function UserRow({ identity }: { identity: string }) {
  const { theme } = useTheme();
  const { identityKey } = useCurrentIdentity();
  const isSelf = identityKey === identity;

  return (
    <ProfileRow
      identity={identity}
      noFollowingBadge
      onPress={() => router.push(Routes.tabs.profile(identity))}
      style={{ borderBottomWidth: 1, borderColor: theme.palette.neutral_25 }}
      trailing={!isSelf ? <FollowButton identity={identity} /> : undefined}
    />
  );
}
