import type { CalendarEventData } from '@/src/features/calendar-events/lib/calendar-event';
import {
  ATTENDANCE_FIELD,
  attendanceBodyFields,
  attendanceValues,
} from './attendance';

const event: CalendarEventData = {
  id: 'ab12',
  identity: 'alice',
  keyFingerprint: 'cafe',
  sequence: '3',
  contentDigest: 'd1ge57',
  title: 'Harbor meetup',
  startAt: Date.UTC(2026, 10, 25, 18, 0),
  endAt: Date.UTC(2026, 10, 25, 20, 0),
  allDay: false,
  location: { name: 'The Anchor', address: '1 Quay St' },
  hosts: [],
};

describe('attendanceValues', () => {
  it('copies the event so the claim stands without it', () => {
    expect(attendanceValues(event)).toEqual({
      [ATTENDANCE_FIELD.event]: 'Harbor meetup',
      [ATTENDANCE_FIELD.startsAt]: '2026-11-25T18:00:00.000Z',
      [ATTENDANCE_FIELD.endsAt]: '2026-11-25T20:00:00.000Z',
      [ATTENDANCE_FIELD.location]: 'The Anchor, 1 Quay St',
      [ATTENDANCE_FIELD.eventKey]: 'ab12',
      [ATTENDANCE_FIELD.eventDigest]: 'd1ge57',
    });
  });

  it('uses the date only for all day events', () => {
    const values = attendanceValues({
      ...event,
      allDay: true,
      startAt: Date.UTC(2026, 10, 25),
      endAt: undefined,
    });

    expect(values[ATTENDANCE_FIELD.startsAt]).toBe('2026-11-25');
    expect(values[ATTENDANCE_FIELD.endsAt]).toBe('');
  });
});

describe('attendanceBodyFields', () => {
  it('hides the key, the digest and unset fields', () => {
    const fields = [
      {
        key: ATTENDANCE_FIELD.location,
        label: 'Location',
        value: 'The Anchor',
      },
      { key: ATTENDANCE_FIELD.endsAt, label: 'Ends', value: '' },
      { key: ATTENDANCE_FIELD.eventKey, label: 'Event key', value: 'ab12' },
      { key: ATTENDANCE_FIELD.eventDigest, label: 'Event digest', value: 'd1' },
    ];

    expect(attendanceBodyFields(fields).map((field) => field.key)).toEqual([
      ATTENDANCE_FIELD.location,
    ]);
  });

  it('shows times as dates rather than ISO strings', () => {
    const [starts] = attendanceBodyFields([
      {
        key: ATTENDANCE_FIELD.startsAt,
        label: 'Starts',
        value: '2026-11-25T18:00:00.000Z',
      },
    ]);

    expect(starts?.value).toContain('2026');
    expect(starts?.value).not.toContain('T18');
  });
});
