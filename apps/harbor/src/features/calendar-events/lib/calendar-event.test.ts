jest.mock('@polycentric/react-native-sdk', () => ({}));
jest.mock('@/src/common/query/hooks/useQuery', () => ({}));

import {
  type CalendarEventData,
  type CalendarEventForm,
  EMPTY_CALENDAR_EVENT_FORM,
  calendarEventFromForm,
  sortCalendarEvents,
} from './calendar-event';

const form = (fields: Partial<CalendarEventForm>): CalendarEventForm => ({
  ...EMPTY_CALENDAR_EVENT_FORM,
  title: 'Launch party',
  date: '2027-03-05',
  startTime: '19:00',
  ...fields,
});

const event = (fields: Partial<CalendarEventData>): CalendarEventData => ({
  id: 'id',
  identity: 'identity',
  keyFingerprint: 'fingerprint',
  sequence: '1',
  title: 'Launch party',
  startAt: 0,
  allDay: false,
  hosts: [],
  ...fields,
});

describe('calendarEventFromForm', () => {
  it('stores times typed in local time', () => {
    const result = calendarEventFromForm(form({ endTime: '21:30' }), 'me');

    expect(result).toMatchObject({
      event: {
        startAt: BigInt(new Date(2027, 2, 5, 19, 0).getTime()),
        endAt: BigInt(new Date(2027, 2, 5, 21, 30).getTime()),
      },
    });
  });

  it('stores an all-day event as a UTC midnight', () => {
    const result = calendarEventFromForm(
      form({ allDay: true, startTime: '' }),
      'me',
    );

    expect(result).toMatchObject({
      event: { startAt: BigInt(Date.UTC(2027, 2, 5)), allDay: true },
    });
  });

  it.each([
    [{}, ['me']],
    [{ isHost: false, hosts: ['a', 'b'] }, ['a', 'b']],
    [{ isHost: false }, []],
  ])('names the hosts for %j', (fields, hosts) => {
    const result = calendarEventFromForm(form(fields), 'me');

    expect('event' in result && result.event.hosts).toEqual(hosts);
  });

  it('keeps the address and point of a picked place', () => {
    const result = calendarEventFromForm(
      form({
        location: 'The Anchor, 34 Park Street, London',
        locationPlace: {
          id: 'N42',
          name: 'The Anchor',
          address: '34 Park Street, London',
          latitude: 51.5072,
          longitude: -0.1276,
        },
      }),
      'me',
    );

    expect('event' in result && result.event.location).toEqual({
      name: 'The Anchor',
      address: '34 Park Street, London',
      point: { latitude: 51.5072, longitude: -0.1276 },
      url: undefined,
    });
  });

  it.each([
    [{ title: '  ' }, 'Add a title.'],
    [{ date: '2027-02-31' }, 'Choose a date.'],
    [{ endTime: '18:00' }, 'The end must be after the start.'],
  ])('rejects %j', (fields, error) => {
    expect(calendarEventFromForm(form(fields), 'me')).toEqual({ error });
  });
});

describe('sortCalendarEvents', () => {
  it('lists upcoming events soonest first, then past ones latest first', () => {
    const sorted = sortCalendarEvents(
      [
        event({ id: 'long-past', startAt: 100 }),
        event({ id: 'later', startAt: 3000 }),
        event({ id: 'just-past', startAt: 900 }),
        event({ id: 'soon', startAt: 2000 }),
        event({ id: 'under-way', startAt: 500, endAt: 1500 }),
      ],
      1000,
    );

    expect(sorted.map((e) => e.id)).toEqual([
      'under-way',
      'soon',
      'later',
      'just-past',
      'long-past',
    ]);
  });
});
