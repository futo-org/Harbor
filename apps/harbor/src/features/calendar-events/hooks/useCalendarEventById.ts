import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import {
  COLLECTION,
  type FetchMode,
  Query,
  v2,
} from '@polycentric/react-native-sdk';
import { useMemo } from 'react';
import {
  type CalendarEventData,
  decodeCalendarEventBundle,
  decodeCalendarEventServerBundle,
} from '../lib/calendar-event';
import {
  NO_EVENT_KEY,
  calendarQueryKeys,
  queryEventKey,
} from '../lib/calendar-queries';

/** Loads an event from the calendar service, or the local copy */
export function useCalendarEventById(
  identityId: string | undefined,
  keyFingerprint: string | undefined,
  sequence: bigint | undefined,
  fetchMode?: FetchMode,
): {
  event: CalendarEventData | null;
  isLoading: boolean;
  isRefreshing: boolean;
  refresh: () => void;
} {
  const enabled = !!identityId && sequence != null && !!keyFingerprint;
  const opts = fetchMode ? { fetchMode } : undefined;

  const stored = useQuery(
    [
      'event',
      String(COLLECTION.CALENDAR),
      identityId ?? '',
      keyFingerprint ?? '',
      sequence?.toString() ?? '',
    ],
    new Query.GetEvent({
      identity: identityId ?? '',
      collection: COLLECTION.CALENDAR,
      sequence: sequence ?? 0n,
      signerKeyPrefix: keyFingerprint,
    }),
    opts,
    enabled,
  );

  const storedEvent = useMemo<CalendarEventData | null>(() => {
    if (!enabled || !stored.data || stored.data.byteLength === 0) return null;

    try {
      const decoded = decodeCalendarEventBundle(
        v2.EventBundle.fromBinary(new Uint8Array(stored.data)),
      );

      // Sequences can repeat across signers, so check it's the one we asked for
      return decoded?.keyFingerprint === keyFingerprint &&
        decoded.sequence === sequence?.toString()
        ? decoded
        : null;
    } catch {
      return null;
    }
  }, [enabled, stored.data, keyFingerprint, sequence]);

  // The service needs the full key, which we get from the stored event
  const eventKey = useMemo(
    () => queryEventKey(storedEvent?.id),
    [storedEvent?.id],
  );

  const served = useQuery(
    calendarQueryKeys.event(storedEvent?.id ?? ''),
    new Query.GetCalendarEvent({ eventKey: eventKey ?? NO_EVENT_KEY }),
    opts,
    !!eventKey,
  );

  const servedEvent = useMemo<CalendarEventData | null>(() => {
    if (!eventKey || !served.data || served.data.byteLength === 0) return null;

    try {
      const { event } = v2.GetCalendarEventResponse.fromBinary(
        new Uint8Array(served.data),
      );

      return event ? decodeCalendarEventServerBundle(event) : null;
    } catch {
      return null;
    }
  }, [eventKey, served.data]);

  return {
    event: servedEvent ?? storedEvent,
    isLoading: stored.isLoading,
    isRefreshing: stored.hasPendingRefresh || served.hasPendingRefresh,
    refresh: () => {
      stored.refresh(RefreshStrategy.Lazy);
      served.refresh(RefreshStrategy.Lazy);
    },
  };
}
