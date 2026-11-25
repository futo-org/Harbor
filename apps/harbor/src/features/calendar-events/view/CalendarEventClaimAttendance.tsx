import { Button } from '@/src/common/components';
import { withIdentity } from '@/src/common/lib/authGate';
import { ClaimCreateSheet } from '@/src/features/verifications/claims/create/ClaimCreateSheet';
import { useState } from 'react';
import type { CalendarEventData } from '../lib/calendar-event';

type CalendarEventClaimAttendanceProps = { event: CalendarEventData };

/** Starts an attendance claim for the event */
export function CalendarEventClaimAttendance({
  event,
}: CalendarEventClaimAttendanceProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        title="I attended"
        variant="tertiary"
        size="sm"
        testID="calendar-event-claim-attendance"
        onPress={() => withIdentity(() => setOpen(true))}
      />

      <ClaimCreateSheet
        open={open}
        onClose={() => setOpen(false)}
        calendarEvent={event}
      />
    </>
  );
}
