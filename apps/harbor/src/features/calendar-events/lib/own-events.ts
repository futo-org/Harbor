import {
  decodeBundle,
  eventKeyId,
} from '@/src/common/lib/polycentric-hooks/helpers';
import {
  COLLECTION,
  type PolycentricClient,
  type v2,
} from '@polycentric/react-native-sdk';
import {
  type CalendarEventData,
  decodeCalendarEventBundle,
} from './calendar-event';

type RsvpStatus = v2.CalendarEventRsvpStatus;

/** Our events and RSVPs from local storage */
export function loadOwnEventsAndRsvps(client: PolycentricClient): {
  ownEvents: CalendarEventData[];
  rsvps: Map<string, RsvpStatus>;
} {
  const self = client.activeIdentityKey;
  if (!self) return { ownEvents: [], rsvps: new Map() };

  const ownEvents = client
    .listValidEvents(self, COLLECTION.CALENDAR)
    .map(decodeCalendarEventBundle)
    .filter((event) => event !== null);

  // Oldest first so the latest RSVP wins
  const answers = listOwnRsvps(client, self).sort((a, b) =>
    Number(a.event.createdAt - b.event.createdAt),
  );

  const rsvps = new Map<string, RsvpStatus>();

  for (const { content } of answers) {
    if (content.eventKey) {
      rsvps.set(eventKeyId(content.eventKey), content.status);
    }
  }

  return { ownEvents, rsvps };
}

/** Our RSVP events, decoded */
export function listOwnRsvps(client: PolycentricClient, self: string) {
  return client
    .listValidEvents(self, COLLECTION.CALENDAR)
    .map((bundle) => decodeBundle(bundle, 'calendarEventRsvp'))
    .filter((entry) => entry !== null);
}
