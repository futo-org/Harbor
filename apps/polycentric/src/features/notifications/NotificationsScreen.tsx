import { Text } from '@/src/common/components';
import { List } from '@/src/common/components/List';
import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { Atoms } from '@/src/common/theme';
import { View } from 'react-native';
import useListNotifications from './hooks/useListNotifications';
import { NotificationData } from './utils';
import { useFocusedRefresh } from '@/src/common/lib/navigation/useFocusedRefresh';

export default function NotificationsScreen() {
  const query = useListNotifications();
  useFocusedRefresh(() => query.refresh());

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <List<NotificationData>
          data={[]}
          refreshing={query.isLoading}
          renderItem={() => <></>}
          HeaderComponent={<Topbar title="Notifications" left={<></>} />}
          ListEmptyComponent={() =>
            !query.isLoading && (
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
