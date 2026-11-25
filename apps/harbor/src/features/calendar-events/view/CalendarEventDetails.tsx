import { Text } from '@/src/common/components';
import { Atoms, BorderRadius } from '@/src/common/theme';
import { View } from 'react-native';
import { CalendarEventAttendees } from './CalendarEventAttendees';
import { CalendarEventCover } from '../card/CalendarEventCover';
import { CalendarEventHosts } from './CalendarEventHosts';
import { CalendarEventInfo } from './CalendarEventInfo';
import type { CalendarEventData } from '../lib/calendar-event';

type CalendarEventDetailsProps = { event: CalendarEventData };

/** Body of the event page */
export function CalendarEventDetails({ event }: CalendarEventDetailsProps) {
  return (
    <View style={[Atoms.p_lg, Atoms.gap_xl]}>
      <CalendarEventCover
        image={event.image}
        targetSize={1024}
        style={[
          Atoms.w_full,
          { aspectRatio: 16 / 9, borderRadius: BorderRadius.lg },
        ]}
      />

      <View style={Atoms.gap_md}>
        <Text fontSize={28} lineHeight={34} fontWeight="bold" selectable>
          {event.title}
        </Text>
        <CalendarEventHosts event={event} />
      </View>

      <CalendarEventInfo event={event} />

      {event.description ? (
        <View style={Atoms.gap_sm}>
          <Text variant="title">Details</Text>
          <Text variant="body" selectable>
            {event.description}
          </Text>
        </View>
      ) : null}

      <CalendarEventAttendees event={event} />
    </View>
  );
}
