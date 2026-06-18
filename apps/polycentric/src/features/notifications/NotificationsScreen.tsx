import { Text } from '@/src/common/components';
import { List } from '@/src/common/components/List';
import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { useFocusedRefresh } from '@/src/common/lib/navigation/useFocusedRefresh';
import { Atoms } from '@/src/common/theme';
import { RefreshControl, View } from 'react-native';
import Notification from './Notification';
import useListNotifications from './hooks/useListNotifications';
import { NotificationData } from './utils';
import { isWeb } from '@/src/common/util/platform';

export default function NotificationsScreen() {
  const { items, isLoading, refresh } = useListNotifications();
  useFocusedRefresh(refresh);

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <List<NotificationData>
          data={items}
          refreshing={isLoading}
          refreshControl={
            isWeb ? undefined : (
              <RefreshControl refreshing={isLoading} onRefresh={refresh} />
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
