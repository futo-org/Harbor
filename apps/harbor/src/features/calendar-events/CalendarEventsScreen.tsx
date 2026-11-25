import { Button, Text, TextInput } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { List } from '@/src/common/components/List';
import { ListEmpty } from '@/src/common/components/ListEmpty';
import { usePageTitle } from '@/src/common/lib/navigation/usePageTitle';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarEventCard } from './card/CalendarEventCard';
import { CalendarEventCreateSheet } from './create/CalendarEventCreateSheet';
import { useCalendarEvents, useHostRequests } from './hooks/useCalendarEvents';
import { useSearchCalendarEvents } from './hooks/useSearchCalendarEvents';
import type { CalendarEventData } from './lib/calendar-event';

/** Events list with search and create */
export default function CalendarEventsScreen() {
  usePageTitle('Events');
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [createOpen, setCreateOpen] = useState(false);
  const { events, isLoading, isRefreshing, refresh } = useCalendarEvents();
  const hostRequests = useHostRequests();
  const [searchText, setSearchText] = useState('');
  const search = useSearchCalendarEvents(searchText);
  const shown = search.isSearching ? search.events : events;
  const loading = search.isSearching ? search.isLoading : isLoading;

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <List<CalendarEventData>
          data={shown}
          keyExtractor={(event) => event.id}
          renderItem={({ item }) => <CalendarEventCard event={item} />}
          HeaderComponent={
            <Topbar
              title="Events"
              right={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Create an event"
                  testID="calendar-events-create"
                  onPress={() => setCreateOpen(true)}
                  hitSlop={Spacing.lg}
                  style={({ pressed }) => [
                    Atoms.p_xs,
                    Atoms.rounded_full,
                    pressed && theme.atoms.box.primary.bg_hover,
                  ]}
                >
                  <Icon name="add" size={24} color="primary" />
                </Pressable>
              }
            />
          }
          ListHeaderComponent={
            <View>
              <View style={[Atoms.px_lg, Atoms.py_md]}>
                <TextInput
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="Search events"
                  testID="calendar-events-search"
                />
              </View>
              {search.isSearching || hostRequests.length === 0 ? null : (
                <View testID="calendar-events-host-requests">
                  <Text
                    variant="small"
                    color="secondary"
                    style={[Atoms.px_lg, Atoms.pb_xs]}
                  >
                    You've been asked to host
                  </Text>
                  {hostRequests.map((event) => (
                    <CalendarEventCard key={event.id} event={event} />
                  ))}
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <View style={[Atoms.items_center, Atoms.py_3xl]}>
                <ActivityIndicator />
              </View>
            ) : (
              <ListEmpty>
                <View style={[Atoms.items_center, Atoms.gap_lg]}>
                  <Text variant="body" color="muted" style={Atoms.text_center}>
                    Events from you and the people you follow will show up here.
                  </Text>
                  <Button
                    title="Create an event"
                    variant="primary"
                    icon="calendar"
                    onPress={() => setCreateOpen(true)}
                  />
                </View>
              </ListEmpty>
            )
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }}
          refreshControl={
            isWeb ? undefined : (
              <RefreshControl refreshing={isRefreshing} onRefresh={refresh} />
            )
          }
          showsVerticalScrollIndicator={false}
        />
        <CalendarEventCreateSheet
          open={createOpen}
          onClose={() => setCreateOpen(false)}
        />
      </Screen.PrimaryColumn>
    </Screen>
  );
}
