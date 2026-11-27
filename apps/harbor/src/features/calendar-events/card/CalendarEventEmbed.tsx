import { Text } from '@/src/common/components';
import { getKeyFingerprint } from '@/src/common/lib/polycentric-hooks/helpers';
import { Atoms, useTheme } from '@/src/common/theme';
import { FetchMode, type v2 } from '@polycentric/react-native-sdk';
import { View } from 'react-native';
import { CalendarEventCard } from './CalendarEventCard';
import { useCalendarEventById } from '../hooks/useCalendarEventById';

type CalendarEventEmbedProps = {
  eventKey: v2.EventKey;
  linkToEvent?: boolean;
};

/** Event embedded in a post */
export function CalendarEventEmbed({
  eventKey,
  linkToEvent = true,
}: CalendarEventEmbedProps) {
  const { theme } = useTheme();

  const { event, isLoading } = useCalendarEventById(
    eventKey.identity,
    getKeyFingerprint(eventKey.signedBy),
    eventKey.sequence,
    FetchMode.OfflineFirst,
  );

  if (event) {
    return (
      <CalendarEventCard event={event} embedded linkToEvent={linkToEvent} />
    );
  }

  return (
    <View
      style={[
        Atoms.p_md,
        Atoms.rounded_md,
        Atoms.mt_sm,
        Atoms.border,
        theme.atoms.outline,
      ]}
    >
      <Text variant="secondary" color="muted">
        {isLoading ? 'Loading event…' : 'This event is unavailable.'}
      </Text>
    </View>
  );
}
