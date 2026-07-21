import { Button, Text } from '@/src/common/components';
import Icon, { type IconName } from '@/src/common/components/Icon';
import { Sheet } from '@/src/common/components/sheet';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type TextStyle,
  View,
} from 'react-native';
import useBanList from './hooks/useBanList';

type ModeratorDashboardSheetProps = {
  // Server the dashboard is for.
  server: string;
  open: boolean;
  onClose: () => void;
};

type DashboardView = 'menu' | 'ban-list';

type DashboardItem = {
  key: string;
  icon: IconName;
  label: string;
  view: DashboardView;
};

const DASHBOARD_ITEMS: DashboardItem[] = [
  { key: 'ban-list', icon: 'ban', label: 'Ban list', view: 'ban-list' },
];

const VIEW_TITLES: Record<DashboardView, string> = {
  menu: 'Moderator Dashboard',
  'ban-list': 'Ban list',
};

/**
 * Moderation dashboard for a single server the active identity is a
 * moderator on. Hosts a button per moderation submenu.
 */
export default function ModeratorDashboardSheet({
  server,
  open,
  onClose,
}: ModeratorDashboardSheetProps) {
  const [view, setView] = useState<DashboardView>('menu');

  const isMenu = view === 'menu';

  const onClosePress = () => {
    if (isMenu) onClose();
    else setView('menu');
  };

  return (
    <Sheet
      open={open}
      onClose={onClosePress}
      detents={[0.5, 1]}
      scrollable={true}
      header={
        <Sheet.Header
          title={VIEW_TITLES[view]}
          closeIcon={isMenu ? undefined : 'chevronBack'}
          onClose={onClosePress}
        />
      }
    >
      <Sheet.Content style={[Atoms.gap_lg]}>
        <Text
          variant="secondary"
          color="neutral_500"
          style={{ fontFamily: 'monospace' }}
          numberOfLines={1}
        >
          {server}
        </Text>
        {isMenu ? (
          <View style={Atoms.gap_sm}>
            {DASHBOARD_ITEMS.map((item) => (
              <DashboardRow
                key={item.key}
                item={item}
                onPress={() => setView(item.view)}
              />
            ))}
          </View>
        ) : (
          <BanList server={server} />
        )}
      </Sheet.Content>
    </Sheet>
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

function BanList({ server }: { server: string }) {
  const { theme } = useTheme();
  const { isLoading, bans, unban } = useBanList(server, true);

  if (isLoading) {
    return (
      <ActivityIndicator
        size="small"
        color={theme.palette.primary_500}
        accessibilityLabel="Loading ban list"
      />
    );
  }

  if (bans.length === 0) {
    return (
      <Text variant="secondary" color="neutral_500">
        No banned users
      </Text>
    );
  }

  return (
    <View style={Atoms.gap_sm}>
      {bans.map((identity) => (
        <BanListRow key={identity} identity={identity} unban={unban} />
      ))}
    </View>
  );
}

function BanListRow({
  identity,
  unban,
}: {
  identity: string;
  unban: (identity: string) => Promise<void>;
}) {
  const { theme } = useTheme();
  const [isUnbanning, setIsUnbanning] = useState<boolean>(false);

  const onPress = async () => {
    setIsUnbanning(true);
    try {
      await unban(identity);
    } catch (err) {
      console.error('Failed to unban:', err);
      setIsUnbanning(false);
    }
    // On success the row unmounts with the list update.
  };

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.justify_between,
        Atoms.items_center,
        Atoms.gap_md,
        Atoms.p_md,
        Atoms.rounded_md,
        {
          backgroundColor: withHexOpacity(theme.palette.neutral_500, '20'),
        },
      ]}
    >
      <Text
        variant="secondary"
        style={[
          { fontFamily: 'monospace', flex: 1 },
          // An unbroken 64-char hash never wraps on web without an
          // explicit break rule; native Text breaks mid-word on its own.
          isWeb && ({ wordBreak: 'break-all' } as unknown as TextStyle),
        ]}
      >
        {identity}
      </Text>
      {isUnbanning ? (
        <ActivityIndicator
          size="small"
          color={theme.palette.primary_500}
          accessibilityLabel="Unbanning"
        />
      ) : (
        <Button size="sm" variant="tertiary" title="Unban" onPress={onPress} />
      )}
    </View>
  );
}
