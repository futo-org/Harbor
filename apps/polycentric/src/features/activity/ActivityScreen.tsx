import { Text } from '@/src/common/components';
import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { Atoms } from '@/src/common/theme';
import { FlashList } from '@shopify/flash-list';
import { View } from 'react-native';

export default function ActivityScreen() {
  return (
    <Screen>
      <Screen.PrimaryColumn>
        <FlashList
          data={[]}
          renderItem={() => <></>}
          ListHeaderComponent={<Topbar title="Activity" />}
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
