import { Button, Text, TextInput } from '@/src/common/components';
import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { ScrollView } from '@/src/common/components/ScrollView';
import { confirm } from '@/src/common/lib/dialogs/alert';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, type TextStyle, View } from 'react-native';
import useBanList from './hooks/useBanList';

// Delay before a keystroke triggers a new query, so typing doesn't fire
// a request (and reset to the first page) on every character.
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The identities banned on a server — searchable and navigated a page at
 * a time — with an unban action per row. Reached from the moderator
 * dashboard; the target server is carried in the `server` route param.
 */
export default function BanListScreen() {
  const { server } = useLocalSearchParams<{ server: string }>();
  const { theme } = useTheme();

  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  const { isLoading, bans, page, hasPrev, hasNext, goPrev, goNext, unban } =
    useBanList(server ?? '', debouncedSearch, !!server);

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View style={[Atoms.flex_1]}>
          <ScrollView
            HeaderComponent={<Topbar title="Ban list" />}
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

              <TextInput
                placeholder="Search banned identities"
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />

              {isLoading ? (
                <View style={[Atoms.items_center, Atoms.p_lg]}>
                  <ActivityIndicator
                    size="small"
                    color={theme.palette.primary_500}
                    accessibilityLabel="Loading ban list"
                  />
                </View>
              ) : bans.length === 0 ? (
                <Text variant="secondary" color="neutral_500">
                  {debouncedSearch
                    ? 'No banned users match your search.'
                    : 'No banned users.'}
                </Text>
              ) : (
                <View style={Atoms.gap_sm}>
                  {bans.map((identity) => (
                    <BanListRow
                      key={identity}
                      identity={identity}
                      unban={unban}
                    />
                  ))}
                </View>
              )}

              {(hasPrev || hasNext) && (
                <View
                  style={[
                    Atoms.flex_row,
                    Atoms.items_center,
                    Atoms.justify_between,
                    Atoms.gap_md,
                  ]}
                >
                  <Button
                    size="sm"
                    variant="tertiary"
                    title="Previous"
                    disabled={!hasPrev || isLoading}
                    onPress={goPrev}
                  />
                  <Text variant="secondary" color="neutral_500">
                    Page {page}
                  </Text>
                  <Button
                    size="sm"
                    variant="tertiary"
                    title="Next"
                    disabled={!hasNext || isLoading}
                    onPress={goNext}
                  />
                </View>
              )}
            </View>
          </ScrollView>
        </View>
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
