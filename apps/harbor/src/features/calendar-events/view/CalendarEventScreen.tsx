import { Text } from '@/src/common/components';
import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { PullRefreshControl } from '@/src/common/components/PullRefreshControl';
import { ScrollView } from '@/src/common/components/ScrollView';
import { useHead } from '@/src/common/lib/head/useHead';
import { Atoms } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { CalendarEventActionBar } from './CalendarEventActionBar';
import { CalendarEventDetails } from './CalendarEventDetails';
import { CalendarEventMenu } from './CalendarEventMenu';
import { useCalendarEventById } from '../hooks/useCalendarEventById';
import { useCalendarEventHead } from '@/src/features/calendar-events/head/useCalendarEventHead';

export default function CalendarEventScreen() {
  const {
    identityId,
    keyFingerprint,
    sequence = '',
  } = useLocalSearchParams<{
    identityId: string;
    keyFingerprint: string;
    sequence: string;
  }>();

  const { event, isLoading, isRefreshing, refresh } = useCalendarEventById(
    identityId,
    keyFingerprint,
    /^\d+$/.test(sequence) ? BigInt(sequence) : undefined,
  );

  useHead(useCalendarEventHead(event, isLoading));

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <ScrollView
          HeaderComponent={
            <Topbar
              title="Event"
              right={event ? <CalendarEventMenu event={event} /> : undefined}
            />
          }
          style={Atoms.flex_1}
          showsVerticalScrollIndicator={false}
          refreshControl={
            isWeb ? undefined : (
              <PullRefreshControl
                refreshing={isRefreshing}
                onRefresh={refresh}
              />
            )
          }
        >
          {isLoading && !event ? (
            <View style={[Atoms.items_center, Atoms.py_3xl]}>
              <ActivityIndicator />
            </View>
          ) : null}

          {!isLoading && !event ? (
            <View style={[Atoms.items_center, Atoms.py_3xl]}>
              <Text color="muted">Event not found.</Text>
            </View>
          ) : null}

          {event ? <CalendarEventDetails event={event} /> : null}
        </ScrollView>
        {event ? <CalendarEventActionBar event={event} /> : null}
      </Screen.PrimaryColumn>
    </Screen>
  );
}
