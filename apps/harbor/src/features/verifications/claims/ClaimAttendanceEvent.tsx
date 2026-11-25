import { Text } from '@/src/common/components';
import {
  getKeyFingerprint,
  hexToBytes,
} from '@/src/common/lib/polycentric-hooks/helpers';
import { CalendarEventCard } from '@/src/features/calendar-events/card/CalendarEventCard';
import { useCalendarEventById } from '@/src/features/calendar-events/hooks/useCalendarEventById';
import { v2 } from '@polycentric/react-native-sdk';
import { useMemo } from 'react';
import type { ClaimField } from '../hooks/useClaimById';
import { ATTENDANCE_FIELD } from '../utils/attendance';

type ClaimAttendanceEventProps = { fields: ClaimField[] };

function eventKeyOf(fields: ClaimField[]): v2.EventKey | null {
  const hex = fields.find((f) => f.key === ATTENDANCE_FIELD.eventKey)?.value;
  if (!hex) return null;

  try {
    return v2.EventKey.fromBinary(hexToBytes(hex));
  } catch {
    return null;
  }
}

/** The event an attendance claim is for, while it still exists */
export function ClaimAttendanceEvent({ fields }: ClaimAttendanceEventProps) {
  const eventKey = useMemo(() => eventKeyOf(fields), [fields]);

  const { event, isLoading } = useCalendarEventById(
    eventKey?.identity,
    getKeyFingerprint(eventKey?.signedBy),
    eventKey?.sequence,
  );

  if (event) return <CalendarEventCard event={event} embedded />;
  if (!eventKey || isLoading) return null;

  return (
    <Text variant="small" color="muted" testID="claim-attendance-event-removed">
      The event is no longer available. These details were saved with the claim.
    </Text>
  );
}
