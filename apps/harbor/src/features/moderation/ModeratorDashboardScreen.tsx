import { Text } from '@/src/common/components';
import Icon, { type IconName } from '@/src/common/components/Icon';
import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { ScrollView } from '@/src/common/components/ScrollView';
import { Routes } from '@/src/common/constants';
import { Atoms, useTheme } from '@/src/common/theme';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';

type DashboardItem = {
  key: string;
  icon: IconName;
  label: string;
  // Navigate to this submenu, carrying the current server.
  navigate: (server: string) => void;
};

const DASHBOARD_ITEMS: DashboardItem[] = [
  {
    key: 'ban-list',
    icon: 'ban',
    label: 'Ban list',
    navigate: (server) =>
      router.push(
        `${Routes.tabs.moderation.banList}?server=${encodeURIComponent(
          server,
        )}`,
      ),
  },
];

/**
 * Moderation dashboard for a single server the active identity is a
 * moderator on. Lists a link per moderation submenu.
 */
export default function ModeratorDashboardScreen() {
  const { server } = useLocalSearchParams<{ server: string }>();

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View style={[Atoms.flex_1]}>
          <ScrollView
            HeaderComponent={<Topbar title="Moderator Dashboard" />}
            showsVerticalScrollIndicator={false}
          >
            <View style={[Atoms.p_lg, Atoms.gap_lg]}>
              <Text
                variant="secondary"
                color="neutral_500"
                style={{ fontFamily: 'monospace' }}
                numberOfLines={1}
              >
                {server}
              </Text>
              <View style={Atoms.gap_sm}>
                {DASHBOARD_ITEMS.map((item) => (
                  <DashboardRow
                    key={item.key}
                    item={item}
                    onPress={() => item.navigate(server ?? '')}
                  />
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}

function DashboardRow({
  item,
  onPress,
}: {
  item: DashboardItem;
  onPress: () => void;
}) {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        Atoms.flex_row,
        Atoms.items_center,
        Atoms.justify_between,
        Atoms.p_md,
        Atoms.pl_lg,
        Atoms.rounded_md,
        {
          backgroundColor: pressed
            ? theme.palette.neutral_50
            : theme.palette.neutral_25,
        },
      ]}
    >
      <View style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_md]}>
        <Icon name={item.icon} size={18} color="primary_600" />
        <Text fontWeight="bold">{item.label}</Text>
      </View>
      <Icon name="chevronForward" size={18} color="neutral_500" />
    </Pressable>
  );
}
