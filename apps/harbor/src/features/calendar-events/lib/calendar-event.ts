import {
  bytesToHex,
  decodeBundle,
  eventKeyId,
  getKeyFingerprint,
} from '@/src/common/lib/polycentric-hooks/helpers';
import {
  DATE_FORMAT,
  DATE_PATTERN,
  TIME_FORMAT,
  TIME_PATTERN,
} from '@/src/common/components/form/DateTimeField/lib/date-time-value';
import type { v2 } from '@polycentric/react-native-sdk';
import type { Place } from './geocoder-api';

/** Decoded calendar event. Times are UTC ms */
export type CalendarEventData = {
  /** Hex of the event key */
  id: string;
  identity: string;
  keyFingerprint: string;
  sequence: string;
  /** Hex digest of the content. Identifies the event even if it's deleted */
  contentDigest?: string;
  title: string;
  description?: string;
  startAt: number;
  endAt?: number;
  allDay: boolean;
  location?: v2.CalendarEventLocation;
  image?: v2.ImageSet;
  /** Named hosts. Empty if there's no host */
  hosts: string[];
  /** Server stats. Unset for events read locally */
  server?: {
    /** Hosts who have accepted */
    confirmedHosts: string[];
    goingCount: number;
    maybeCount: number;
    notGoingCount: number;
  };
};

export function decodeCalendarEventBundle(
  bundle: v2.EventBundle,
): CalendarEventData | null {
  const decoded = decodeBundle(bundle, 'calendarEvent');
  const key = decoded?.event.key;
  if (!decoded || !key?.signedBy) return null;

  const { content, event } = decoded;
  const digest = event.contentDigest?.value;

  return {
    id: eventKeyId(key),
    identity: key.identity,
    keyFingerprint: getKeyFingerprint(key.signedBy),
    sequence: key.sequence.toString(),
    contentDigest: digest ? bytesToHex(digest) : undefined,
    title: content.title,
    description: content.description || undefined,
    startAt: Number(content.startAt),
    endAt: content.endAt === undefined ? undefined : Number(content.endAt),
    allDay: content.allDay,
    location: content.location,
    image: content.image,
    // Older builds don't have hosts
    hosts: content.hosts ?? [],
  };
}

/** OpenStreetMap link for a point */
export function mapUrl({
  latitude,
  longitude,
}: v2.GeoPoint): `https://${string}` {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;
}

/** Decode a calendar event with the server stats */
export function decodeCalendarEventServerBundle(
  bundle: v2.CalendarEventBundle,
): CalendarEventData | null {
  const event = bundle.eventBundle
    ? decodeCalendarEventBundle(bundle.eventBundle)
    : null;

  if (!event) return null;

  return {
    ...event,
    server: {
      confirmedHosts: bundle.confirmedHosts ?? [],
      goingCount: Number(bundle.stats?.goingCount ?? 0),
      maybeCount: Number(bundle.stats?.maybeCount ?? 0),
      notGoingCount: Number(bundle.stats?.notGoingCount ?? 0),
    },
  };
}

/** Not over yet */
export function isUpcoming(event: CalendarEventData, now: number): boolean {
  return (event.endAt ?? event.startAt) >= now;
}

/** Upcoming first (soonest), then past (latest) */
export function sortCalendarEvents(
  events: CalendarEventData[],
  now: number,
): CalendarEventData[] {
  const upcoming = events
    .filter((event) => isUpcoming(event, now))
    .sort((a, b) => a.startAt - b.startAt);

  const past = events
    .filter((event) => !isUpcoming(event, now))
    .sort((a, b) => b.startAt - a.startAt);

  return [...upcoming, ...past];
}

/** One line location */
export function calendarEventLocationLine(
  event: CalendarEventData,
): string | null {
  const { name, address, url } = event.location ?? {};
  return name || address || (url ? 'Online' : null);
}

type EventTimes = Pick<CalendarEventData, 'startAt' | 'endAt' | 'allDay'>;

/** The day, or both days if it ends on another. All day events are UTC midnights */
function formatDays(
  event: EventTimes,
  options: Intl.DateTimeFormatOptions,
): string {
  const format = (at: number) =>
    new Date(at).toLocaleDateString(undefined, {
      ...options,
      ...(event.allDay ? { timeZone: 'UTC' } : null),
    });

  const start = format(event.startAt);
  const end = event.endAt === undefined ? start : format(event.endAt);

  return start === end ? start : `${start} – ${end}`;
}

/** Date and time in the viewer's timezone */
export function formatCalendarEventTime(event: EventTimes): string {
  if (event.allDay) return formatDays(event, DATE_FORMAT);

  const start = new Date(event.startAt);
  const startDate = start.toLocaleDateString(undefined, DATE_FORMAT);
  const startTime = start.toLocaleTimeString(undefined, TIME_FORMAT);
  if (event.endAt === undefined) return `${startDate}, ${startTime}`;

  const end = new Date(event.endAt);
  const endDate = end.toLocaleDateString(undefined, DATE_FORMAT);
  const endTime = end.toLocaleTimeString(undefined, TIME_FORMAT);

  return startDate === endDate
    ? `${startDate}, ${startTime} – ${endTime}`
    : `${startDate}, ${startTime} – ${endDate}, ${endTime}`;
}

/** Date only */
export function formatCalendarEventDate(event: EventTimes): string {
  return formatDays(event, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Time range with timezone */
export function formatCalendarEventHours(event: EventTimes): string {
  if (event.allDay) return 'All day';

  const start = new Date(event.startAt).toLocaleTimeString(undefined, {
    ...TIME_FORMAT,
    ...(event.endAt === undefined ? { timeZoneName: 'short' } : null),
  });

  if (event.endAt === undefined) return start;

  const end = new Date(event.endAt).toLocaleTimeString(undefined, {
    ...TIME_FORMAT,
    timeZoneName: 'short',
  });

  return `${start} – ${end}`;
}

export type CalendarEventForm = {
  title: string;
  description: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, 24 hour */
  startTime: string;
  /** HH:MM, 24 hour. Empty for no end time */
  endTime: string;
  allDay: boolean;
  /** Typed text, or the label of the picked place */
  location: string;
  /** Picked place. Cleared if the text is edited */
  locationPlace?: Place;
  locationUrl: string;
  isHost: boolean;
  /** Other hosts. Only used when isHost is off */
  hosts: string[];
};

export const EMPTY_CALENDAR_EVENT_FORM: CalendarEventForm = {
  title: '',
  description: '',
  date: '',
  startTime: '',
  endTime: '',
  allDay: false,
  location: '',
  locationUrl: '',
  isHost: true,
  hosts: [],
};

function parseDate(value: string): [number, number, number] | null {
  const match = DATE_PATTERN.exec(value.trim());
  if (!match) return null;

  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];

  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject dates that roll over, eg 31st Feb
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? [year, month, day]
    : null;
}

function parseTime(value: string): [number, number] | null {
  const match = TIME_PATTERN.exec(value.trim());
  if (!match) return null;

  const [hours, minutes] = [Number(match[1]), Number(match[2])];

  return hours < 24 && minutes < 60 ? [hours, minutes] : null;
}

/** Build the event from the form. Returns an error if something is wrong */
export function calendarEventFromForm(
  form: CalendarEventForm,
  creator: string,
): { event: Omit<v2.CalendarEvent, 'id'> } | { error: string } {
  const title = form.title.trim();
  if (!title) return { error: 'Add a title.' };

  const date = parseDate(form.date);
  if (!date) return { error: 'Choose a date.' };

  const [year, month, day] = date;

  let startAt: number;
  let endAt: number | undefined;

  if (form.allDay) {
    startAt = Date.UTC(year, month - 1, day);
  } else {
    const start = parseTime(form.startTime);
    if (!start) return { error: 'Choose a start time.' };

    startAt = new Date(year, month - 1, day, ...start).getTime();

    if (form.endTime.trim()) {
      const end = parseTime(form.endTime);
      if (!end) return { error: 'Choose an end time.' };

      endAt = new Date(year, month - 1, day, ...end).getTime();

      if (endAt <= startAt)
        return { error: 'The end must be after the start.' };
    }
  }

  // Picked places keep their address and coordinates
  const place = form.locationPlace;
  const locationName = place?.name ?? form.location.trim();
  const locationUrl = form.locationUrl.trim();

  if (locationUrl && !/^https?:\/\/\S+$/i.test(locationUrl)) {
    return { error: 'The link must start with http:// or https://.' };
  }

  const hasLocation = !!(locationName || locationUrl);

  return {
    event: {
      title,
      description: form.description.trim() || undefined,
      startAt: BigInt(startAt),
      endAt: endAt === undefined ? undefined : BigInt(endAt),
      allDay: form.allDay,
      location: hasLocation
        ? {
            name: locationName,
            address: place?.address || undefined,
            point: place
              ? { latitude: place.latitude, longitude: place.longitude }
              : undefined,
            url: locationUrl || undefined,
          }
        : undefined,
      labels: ['harbor'],
      // Hosts are optional
      hosts: form.isHost ? [creator] : form.hosts,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
    },
  };
}

/** Only link http(s) urls */
export function isWebUrl(
  url: string,
): url is `https://${string}` | `http://${string}` {
  return /^https?:\/\//i.test(url);
}
