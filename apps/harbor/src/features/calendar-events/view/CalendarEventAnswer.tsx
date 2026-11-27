import { Button, Text } from '@/src/common/components';
import { useUsername } from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { v2 } from '@polycentric/react-native-sdk';
import { View } from 'react-native';
import { useCalendarEventHosts } from '../hooks/useCalendarEventHosts';
import { useRsvp } from '../hooks/useRsvp';
import { type CalendarEventData, isUpcoming } from '../lib/calendar-event';
import { CalendarEventClaimAttendance } from './CalendarEventClaimAttendance';
import { RsvpActions } from './RsvpActions';

type CalendarEventAnswerProps = { event: CalendarEventData };

/** RSVP buttons, or the host prompt if they've been asked to host */
export function CalendarEventAnswer({ event }: CalendarEventAnswerProps) {
  const { isAskedToHost, isHosting } = useCalendarEventHosts(event);
  const { status, answer } = useRsvp(event.id);
  const creator = useUsername(event.identity);

  if (isAskedToHost) {
    return (
      <View style={Atoms.gap_sm} testID="calendar-event-host-request">
        <Text variant="secondary">{creator} listed you as a host.</Text>
        <View style={[Atoms.flex_row, Atoms.gap_sm]}>
          <Button
            title="Confirm"
            variant="primary"
            size="sm"
            style={Atoms.flex_1}
            testID="calendar-event-host-confirm"
            onPress={() => answer(v2.CalendarEventRsvpStatus.HOSTING)}
          />
          <Button
            title="Decline"
            variant="tertiary"
            size="sm"
            style={Atoms.flex_1}
            testID="calendar-event-host-decline"
            onPress={() => answer(v2.CalendarEventRsvpStatus.NOT_GOING)}
          />
        </View>
      </View>
    );
  }

  if (isHosting) {
    return (
      <View
        style={[Atoms.flex_row, Atoms.align_center, Atoms.justify_between]}
        testID="calendar-event-hosting"
      >
        <Text variant="secondary" fontWeight="bold">
          You're hosting this event
        </Text>
        <Button
          title="Step down"
          variant="tertiary"
          size="sm"
          // Same answer again withdraws it
          onPress={() => answer(v2.CalendarEventRsvpStatus.HOSTING)}
        />
      </View>
    );
  }

  const now = Date.now();

  // No RSVPs once the event is over, but they can claim they were there
  if (!isUpcoming(event, now)) {
    return (
      <View
        style={[Atoms.flex_row, Atoms.align_center, Atoms.justify_between]}
        testID="calendar-event-ended"
      >
        <Text variant="secondary" color="muted">
          This event has ended.
        </Text>

        <CalendarEventClaimAttendance event={event} />
      </View>
    );
  }

  // Under way, so they can RSVP or say they're there
  if (event.startAt <= now) {
    return (
      <View style={Atoms.gap_sm}>
        <RsvpActions status={status} answer={answer} />

        <View
          style={[Atoms.flex_row, Atoms.align_center, Atoms.justify_between]}
          testID="calendar-event-started"
        >
          <Text variant="secondary" color="muted">
            This event has started.
          </Text>

          <CalendarEventClaimAttendance event={event} />
        </View>
      </View>
    );
  }

  return <RsvpActions status={status} answer={answer} />;
}
