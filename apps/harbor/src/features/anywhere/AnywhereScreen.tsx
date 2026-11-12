import { List, type ListRef } from '@/src/common/components/List';
import { ListEmpty } from '@/src/common/components/ListEmpty';
import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { Text } from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import { PullRefreshControl } from '@/src/common/components/PullRefreshControl';
import { useFocusedRefresh } from '@/src/common/lib/navigation/useFocusedRefresh';
import { usePageTitle } from '@/src/common/lib/navigation/usePageTitle';
import { Atoms, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { Link } from 'expo-router';
import { useRef } from 'react';
import { View } from 'react-native';
import { AnywhereRow } from './AnywhereRow';
import { AnywhereUrlField } from './AnywhereUrlBar';
import {
  type AnywhereFeedItem,
  useAttributedToFeed,
} from './hooks/useAttributedToFeed';

/**
 * Where Harbor Anywhere starts: the address field, over the pages with the
 * most comments.
 */
export default function AnywhereScreen() {
  usePageTitle('Anywhere');
  const { theme } = useTheme();
  const { pages, isLoading, loadMore, refresh } = useAttributedToFeed();
  const listRef = useRef<ListRef>(null);
  // A nav re-tap scrolls back to the top and refreshes.
  useFocusedRefresh(() => {
    listRef.current?.scrollToTop();
    refresh();
  });

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <List<AnywhereFeedItem>
          ref={listRef}
          data={pages}
          refreshControl={
            isWeb ? undefined : (
              <PullRefreshControl refreshing={isLoading} onRefresh={refresh} />
            )
          }
          keyExtractor={(page) => page.link.url}
          renderItem={({ item }) => <AnywhereRow {...item} />}
          onEndReached={loadMore}
          HeaderComponent={
            <>
              {isWeb ? <Topbar title="Anywhere" left={<></>} /> : null}
              <View
                style={[
                  // As the search bar on Explore.
                  Atoms.px_lg,
                  Atoms.py_md,
                  theme.atoms.bg,
                  {
                    borderBottomWidth: 1,
                    borderBottomColor: theme.palette.neutral_25,
                  },
                ]}
              >
                <AnywhereUrlField />
              </View>
            </>
          }
          ListHeaderComponent={
            pages.length > 0 ? (
              <Text
                variant="title"
                color="neutral_1000"
                fontSize={24}
                lineHeight="xl"
                style={[Atoms.px_lg, Atoms.pt_lg, Atoms.pb_sm]}
                accessibilityRole="header"
              >
                Most commented
              </Text>
            ) : null
          }
          ListEmptyComponent={() =>
            !isLoading && (
              <ListEmpty>
                <Text color="neutral_500" style={Atoms.text_center}>
                  Enter a web address to comment on that page, or comment beside
                  the page itself with the{' '}
                  <Link
                    className="underlineOnHover"
                    href={Routes.tabs.anywhere.browserExtension.index}
                  >
                    <Text color="primary_500">browser extension</Text>
                  </Link>
                </Text>
              </ListEmpty>
            )
          }
        />
      </Screen.PrimaryColumn>
    </Screen>
  );
}
