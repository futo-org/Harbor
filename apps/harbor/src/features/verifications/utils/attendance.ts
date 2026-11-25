import type { CalendarEventData } from '@/src/features/calendar-events/lib/calendar-event';

export const ATTENDANCE_SCHEMA_NAME = 'Attendance';

/** The claim keeps a copy of the event, so it still reads if the event is deleted */
export const ATTENDANCE_FIELD = {
  event: 'event',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
  location: 'location',
  /** Hex of the event key. Links to the event while it exists */
  eventKey: 'event_key',
  /** Hex digest of the event's content. Says which event it was once it's gone */
  eventDigest: 'event_digest',
} as const;

type Field = { key: string; label: string; value: string };

/** ISO 8601. Just the date for all day events, which are UTC midnights */
function isoTime(at: number, allDay: boolean): string {
  const iso = new Date(at).toISOString();

  return allDay ? iso.slice(0, 10) : iso;
}

/** Claim field values for attending an event */
export function attendanceValues(
  event: CalendarEventData,
): Record<string, string> {
  const { name, address, url } = event.location ?? {};

  return {
    [ATTENDANCE_FIELD.event]: event.title,
    [ATTENDANCE_FIELD.startsAt]: isoTime(event.startAt, event.allDay),
    [ATTENDANCE_FIELD.endsAt]:
      event.endAt === undefined ? '' : isoTime(event.endAt, event.allDay),
    [ATTENDANCE_FIELD.location]:
      [name, address].filter(Boolean).join(', ') || url || '',
    [ATTENDANCE_FIELD.eventKey]: event.id,
    [ATTENDANCE_FIELD.eventDigest]: event.contentDigest ?? '',
  };
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  // Date only means all day
  if (value.length === 10) {
    return date.toLocaleDateString(undefined, {
      dateStyle: 'full',
      timeZone: 'UTC',
    });
  }

  return date.toLocaleString(undefined, {
    dateStyle: 'full',
    timeStyle: 'short',
  });
}

/** Fields to show for an attendance claim: readable times, no key or digest */
export function attendanceBodyFields<F extends Field>(fields: F[]): F[] {
  const hidden: string[] = [
    ATTENDANCE_FIELD.eventKey,
    ATTENDANCE_FIELD.eventDigest,
  ];

  const times: string[] = [ATTENDANCE_FIELD.startsAt, ATTENDANCE_FIELD.endsAt];

  return (
    fields
      .filter((field) => !hidden.includes(field.key))
      // Unset optional fields would only show "N/A"
      .filter((field) => field.value.trim().length > 0)
      .map((field) =>
        times.includes(field.key)
          ? { ...field, value: formatTime(field.value) }
          : field,
      )
  );
}
