import { Text } from '@/src/common/components';
import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { Atoms } from '@/src/common/theme';
import { FlashList } from '@shopify/flash-list';
import { View } from 'react-native';
import { List } from '@/src/common/components/List/List';

export default function ActivityScreen() {
  return (
    <Screen>
      <Screen.PrimaryColumn>
        <List
          data={[]}
          renderItem={() => <></>}
          HeaderComponent={<Topbar title="Activity" />}
          ListEmptyComponent={() => (
            <View
              style={[
                Atoms.flex_1,
                Atoms.items_center,
                Atoms.justify_center,
                Atoms.p_lg,
              ]}
            >
              <Text color="neutral_500">You have no activity</Text>
            </View>
          )}
        />
      </Screen.PrimaryColumn>
    </Screen>
  );
}
