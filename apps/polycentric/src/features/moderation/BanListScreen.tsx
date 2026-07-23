import { Button, Text, TextInput } from '@/src/common/components';
import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { List } from '@/src/common/components/List';
import { ListEmpty } from '@/src/common/components/ListEmpty';
import { confirm } from '@/src/common/lib/dialogs/alert';
import { Atoms, Spacing, useTheme, withHexOpacity } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, type TextStyle, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useBanList from './hooks/useBanList';

// Delay before a keystroke triggers a new query, so typing doesn't fire
// a request (and reset the list) on every character.
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The identities banned on a server, searchable and paginated by
 * infinite scroll, with an unban action per row. Reached from the
 * moderator dashboard; the target server is carried in the `server`
 * route param.
 */
export default function BanListScreen() {
  const { server } = useLocalSearchParams<{ server: string }>();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  const { isLoading, isLoadingMore, bans, hasMore, loadMore, unban } =
    useBanList(server ?? '', debouncedSearch, !!server);

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <List<string>
          HeaderComponent={<Topbar title="Ban list" />}
          ListHeaderComponent={
            <View style={[Atoms.p_lg, Atoms.gap_md]}>
              <Text
                variant="secondary"
                color="neutral_500"
                style={{ fontFamily: 'monospace' }}
                numberOfLines={1}
              >
                {server}
              </Text>
              <TextInput
                placeholder="Search banned identities"
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          }
          data={bans}
          keyExtractor={(identity) => identity}
          renderItem={({ item }) => (
            <View style={[Atoms.px_lg, Atoms.pb_sm]}>
              <BanListRow identity={item} unban={unban} />
            </View>
          )}
          ListEmptyComponent={
            isLoading ? (
              <View style={[Atoms.items_center, Atoms.p_lg]}>
                <ActivityIndicator
                  size="small"
                  color={theme.palette.primary_500}
                  accessibilityLabel="Loading ban list"
                />
              </View>
            ) : (
              <ListEmpty>
                {debouncedSearch
                  ? 'No banned users match your search.'
                  : 'No banned users.'}
              </ListEmpty>
            )
          }
          ListFooterComponent={
            isLoadingMore && bans.length > 0 ? (
              <View style={[Atoms.items_center, Atoms.p_lg]}>
                <ActivityIndicator
                  size="small"
                  color={theme.palette.neutral_500}
                  accessibilityLabel="Loading more"
                />
              </View>
            ) : null
          }
          onEndReached={hasMore ? loadMore : undefined}
          onEndReachedThreshold={0.5}
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }}
          showsVerticalScrollIndicator={false}
        />
      </Screen.PrimaryColumn>
    </Screen>
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
    const ok = await confirm({
      title: 'Unban User',
      message: 'Unban this user?',
      confirmText: 'Unban',
    });
    if (!ok) return;
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
