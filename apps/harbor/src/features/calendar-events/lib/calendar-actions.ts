import { eventKeyId } from '@/src/common/lib/polycentric-hooks/helpers';
import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import {
  COLLECTION,
  type PolycentricClient,
  v2,
} from '@polycentric/react-native-sdk';
import { calendarQueryKeys, eventKeyFromId } from './calendar-queries';
import useCalendarStore from '../hooks/useCalendarStore';
import {
  type CalendarEventData,
  decodeCalendarEventBundle,
} from './calendar-event';
import { listOwnRsvps } from './own-events';

type RsvpStatus = v2.CalendarEventRsvpStatus;

export async function createCalendarEvent(
  client: PolycentricClient,
  event: Omit<v2.CalendarEvent, 'id'>,
): Promise<CalendarEventData> {
  const { signedEvent, contentBytes } = await client.createEvent({
    collection: COLLECTION.CALENDAR,
    content: v2.Content.create({
      contentBody: {
        oneofKind: 'calendarEvent',
        calendarEvent: { ...event, id: randomId() },
      },
    }),
  });

  const created = decodeCalendarEventBundle(
    v2.EventBundle.create({
      signedEvent,
      serializedContent: { contentBytes },
    }),
  );

  if (!created) throw new Error("Couldn't read the new event.");

  afterChange(client);

  return created;
}

export async function deleteCalendarEvent(
  client: PolycentricClient,
  eventId: string,
): Promise<void> {
  await deleteByKey(client, eventKeyFromId(eventId));

  afterChange(client);
}

/** RSVP to an event. null withdraws it */
export async function setRsvp(
  client: PolycentricClient,
  eventId: string,
  status: RsvpStatus | null,
): Promise<void> {
  const self = client.activeIdentityKey;
  if (!self) return;

  // RSVPs aren't edited. Delete the old ones, then create a new one
  for (const { event, content } of listOwnRsvps(client, self)) {
    const isForEvent =
      !!content.eventKey && eventKeyId(content.eventKey) === eventId;

    if (isForEvent && event.key) await deleteByKey(client, event.key);
  }

  if (status !== null) {
    await client.createEvent({
      collection: COLLECTION.CALENDAR,
      content: v2.Content.create({
        contentBody: {
          oneofKind: 'calendarEventRsvp',
          calendarEventRsvp: { eventKey: eventKeyFromId(eventId), status },
        },
      }),
    });
  }

  afterChange(client);
}

/** Show the change now, then sync and refetch from the servers */
function afterChange(client: PolycentricClient) {
  useCalendarStore.getState().refreshOwn(client);

  void client
    .sync()
    // Saved locally. The next sync will retry
    .catch((err) => console.warn('calendar sync failed:', err))
    .finally(() => invalidateQuery(client, calendarQueryKeys.all));
}

function deleteByKey(client: PolycentricClient, eventKey: v2.EventKey) {
  return client.createEvent({
    collection: COLLECTION.CALENDAR,
    content: v2.Content.create({
      contentBody: { oneofKind: 'delete', delete: { eventKey } },
    }),
  });
}

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
