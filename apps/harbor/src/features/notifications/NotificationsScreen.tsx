import { Text } from '@/src/common/components';
import { List, type ListRef } from '@/src/common/components/List';
import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { PullRefreshControl } from '@/src/common/components/PullRefreshControl';
import { useEagerLoad } from '@/src/common/lib/navigation/useEagerLoad';
import { useFocusedRefresh } from '@/src/common/lib/navigation/useFocusedRefresh';
import { usePageTitle } from '@/src/common/lib/navigation/usePageTitle';
import { Atoms } from '@/src/common/theme';
import { useIsFocused } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Notification from './Notification';
import useListNotifications from './hooks/useListNotifications';
import { useAcknowledgeNotifications } from './hooks/useUnreadNotificationCount';
import type { NotificationData } from './utils';
import { isWeb } from '@/src/common/util/platform';

export default function NotificationsScreen() {
  usePageTitle('Notifications');

  const enabled = useEagerLoad();
  const { items, isLoading, isRefreshing, refresh } =
    useListNotifications(enabled);
  const listRef = useRef<ListRef>(null);
  // A nav re-tap scrolls back to the top and refreshes.
  useFocusedRefresh(() => {
    listRef.current?.scrollToTop();
    refresh();
  });

  // Every notification on a loaded, focused list counts as seen.
  const acknowledge = useAcknowledgeNotifications();
  const focused = useIsFocused();
  useEffect(() => {
    if (focused && !isLoading && !isRefreshing) void acknowledge();
  }, [focused, isLoading, isRefreshing, acknowledge]);

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <List<NotificationData>
          ref={listRef}
          data={items}
          refreshControl={
            isWeb ? undefined : (
              <PullRefreshControl
                refreshing={isRefreshing}
                onRefresh={refresh}
              />
            )
          }
          keyExtractor={(notification) => notification.id}
          renderItem={({ item }) => <Notification notification={item} />}
          HeaderComponent={
            <Topbar title="Notifications" left={isWeb ? <></> : undefined} />
          }
          ListEmptyComponent={() =>
            !isLoading && (
              <View
                style={[
                  Atoms.flex_1,
                  Atoms.items_center,
                  Atoms.justify_center,
                  Atoms.p_lg,
                ]}
              >
                <Text color="neutral_500">You have no notifications</Text>
              </View>
            )
          }
        />
      </Screen.PrimaryColumn>
    </Screen>
  );
}
