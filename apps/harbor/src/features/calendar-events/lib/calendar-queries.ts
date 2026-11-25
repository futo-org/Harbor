import { hexToBytes } from '@/src/common/lib/polycentric-hooks/helpers';
import { type EventKey, v2 } from '@polycentric/react-native-sdk';

/** Query keys for the calendar service */
export const calendarQueryKeys = {
  all: ['calendar'],
  events: (scope: string, past: boolean) => [
    'calendar',
    'events',
    scope,
    past ? 'past' : 'upcoming',
  ],
  search: (query: string) => ['calendar', 'search', query],
  event: (eventId: string) => ['calendar', 'event', eventId],
  attendees: (eventId: string) => ['calendar', 'attendees', eventId],
};

/** Placeholder key while there's no event. The query stays disabled */
export const NO_EVENT_KEY: EventKey = {
  collection: 0,
  identity: '',
  signedBy: { keyType: 0, key: new ArrayBuffer(0) },
  sequence: 0n,
};

export function eventKeyFromId(eventId: string): v2.EventKey {
  return v2.EventKey.fromBinary(hexToBytes(eventId));
}

/** Hex event id to the EventKey the queries take */
export function queryEventKey(eventId: string | undefined): EventKey | null {
  if (!eventId) return null;

  try {
    const key = eventKeyFromId(eventId);
    if (!key.signedBy || !key.identity) return null;

    return {
      collection: key.collection,
      identity: key.identity,
      signedBy: {
        keyType: key.signedBy.keyType,
        key: new Uint8Array(key.signedBy.key).buffer,
      },
      sequence: key.sequence,
    };
  } catch {
    return null;
  }
}
