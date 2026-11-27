import { Routes } from '@/src/common/constants';
import { COLLECTION, v2 } from '@polycentric/react-native-sdk';
import { findByKey, hasModerationLabel } from '@/src/common/lib/head/content';
import { unaryCall } from '@/src/common/lib/head/unary-call.server';
import type { Head } from '@/src/common/lib/head';
import { createAuthoredMetadata } from '@/src/features/profile/head/create-authored-metadata.server';
import type { Author } from '@/src/features/profile/head';
import { calendarEventHead } from './index';

/** Null if the event is gone or has a moderation label */
async function loadCalendarEventHead(
  author: Author,
  path: string,
  keyFingerprint: string,
  sequence: bigint,
  signal: AbortSignal,
): Promise<Head | null> {
  const response = await unaryCall(
    'EventSyncService/ListEvents',
    v2.ListEventsRequest,
    v2.ListEventsResponse,
    {
      filters: {
        collection: COLLECTION.CALENDAR,
        identity: author.identity,
        sequenceGt: sequence - 1n,
        sequenceLt: sequence + 1n,
      },
    },
    signal,
  );

  const calendarEvent = findByKey(
    response.eventBundles,
    'calendarEvent',
    keyFingerprint,
    sequence,
  )?.content;
  if (
    !calendarEvent ||
    hasModerationLabel(response.eventHints, calendarEvent.labels)
  ) {
    return null;
  }

  return calendarEventHead({
    author,
    path,
    title: calendarEvent.title,
    description: calendarEvent.description,
    startAt: Number(calendarEvent.startAt),
    allDay: calendarEvent.allDay,
    timezone: calendarEvent.timezone,
    location: calendarEvent.location,
    image: calendarEvent.image,
  });
}

export const calendarEventMetadata = createAuthoredMetadata(
  'Event',
  Routes.tabs.calendarEvent,
  loadCalendarEventHead,
);
