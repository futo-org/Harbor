import {
  useCurrentIdentity,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import { Query, v2 } from '@polycentric/react-native-sdk';
import { useEffect, useMemo } from 'react';
import {
  type CalendarEventData,
  decodeCalendarEventServerBundle,
  sortCalendarEvents,
} from '../lib/calendar-event';
import { calendarQueryKeys } from '../lib/calendar-queries';
import useCalendarStore from './useCalendarStore';

const PAGE_SIZE = 50;

/** Decode events from a list or search response */
export function decodeCalendarEvents(
  data: ArrayBuffer | undefined,
  decode: (bytes: Uint8Array) => { events: v2.CalendarEventBundle[] },
): CalendarEventData[] {
  if (!data || data.byteLength === 0) return [];

  try {
    return decode(new Uint8Array(data))
      .events.map(decodeCalendarEventServerBundle)
      .filter((event) => event !== null);
  } catch {
    return [];
  }
}

/** One page of events, or of host requests for `awaitingHost` (null when signed out) */
function useEventsPage(past: boolean, awaitingHost?: string | null) {
  // Fixed while mounted so the query doesn't change every render
  const now = useMemo(() => BigInt(Date.now()), []);

  const scope =
    awaitingHost === undefined ? 'all' : `awaiting:${awaitingHost ?? ''}`;

  const query = useQuery(
    calendarQueryKeys.events(scope, past),
    new Query.ListCalendarEvents({
      identity: undefined,
      awaitingHost: awaitingHost ?? undefined,
      // Upcoming haven't finished yet. Past have, latest first
      endsAfter: past ? undefined : now,
      endsBefore: past ? now : undefined,
      latestFirst: past,
      limit: PAGE_SIZE,
      backwardToken: undefined,
      forwardToken: undefined,
    }),
    undefined,
    awaitingHost !== null,
  );

  const events = useMemo(
    () =>
      decodeCalendarEvents(query.data, (bytes) =>
        v2.ListCalendarEventsResponse.fromBinary(bytes),
      ),
    [query.data],
  );

  return { query, events };
}

/** All events from the servers, plus our own that haven't synced yet */
export function useCalendarEvents() {
  const client = usePolycentric();
  const { identityKey } = useCurrentIdentity();
  const ownEvents = useCalendarStore((s) => s.ownEvents);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-read for a new identity
  useEffect(() => {
    useCalendarStore.getState().refreshOwn(client);
  }, [client, identityKey]);

  const upcoming = useEventsPage(false);
  const past = useEventsPage(true);

  const events = useMemo(() => {
    // Server copy wins as it has the counts
    const byId = new Map<string, CalendarEventData>();

    for (const event of [...ownEvents, ...upcoming.events, ...past.events]) {
      byId.set(event.id, event);
    }

    return sortCalendarEvents([...byId.values()], Date.now());
  }, [ownEvents, upcoming.events, past.events]);

  const refresh = () => {
    useCalendarStore.getState().refreshOwn(client);
    upcoming.query.refresh(RefreshStrategy.Lazy);
    past.query.refresh(RefreshStrategy.Lazy);
  };

  return {
    events,
    isLoading: upcoming.query.isLoading || past.query.isLoading,
    isRefreshing:
      upcoming.query.hasPendingRefresh || past.query.hasPendingRefresh,
    refresh,
  };
}

/** Events we've been asked to host and haven't answered */
export function useHostRequests(): CalendarEventData[] {
  const { identityKey } = useCurrentIdentity();
  return useEventsPage(false, identityKey ?? null).events;
}
