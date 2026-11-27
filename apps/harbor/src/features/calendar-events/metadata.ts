import { Routes } from '@/src/common/constants';
import { truncateText } from '@/src/common/util/truncateText';
import { COLLECTION, v2 } from '@polycentric/react-native-sdk';
import {
  findByKey,
  hasModerationLabel,
  toPageImage,
} from '@/src/common/lib/page-metadata/content';
import { unaryCall } from '@/src/common/lib/page-metadata/unary-call';
import {
  type Page,
  singleLine,
  toDescription,
} from '@/src/common/lib/page-metadata/page';
import { createAuthoredMetadata } from '@/src/features/profile/lib/create-authored-metadata';
import type { Author } from '@/src/features/profile/lib/load-author';

// The viewer's timezone is unknown here, so times are in the venue's
function formatStart(calendarEvent: v2.CalendarEvent): string {
  const start = new Date(Number(calendarEvent.startAt));
  const date = {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  } as const;
  if (calendarEvent.allDay) {
    return start.toLocaleDateString('en-US', { ...date, timeZone: 'UTC' });
  }

  const time = {
    ...date,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  } as const;
  try {
    return start.toLocaleString('en-US', {
      ...time,
      timeZone: calendarEvent.timezone ?? 'UTC',
    });
  } catch {
    // Not a timezone this runtime knows
    return start.toLocaleString('en-US', { ...time, timeZone: 'UTC' });
  }
}

/** Null if the event is gone or has a moderation label */
async function calendarEventPage(
  author: Author,
  path: string,
  keyFingerprint: string,
  sequence: bigint,
  signal: AbortSignal,
): Promise<Page | null> {
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

  const { location } = calendarEvent;
  const place = [location?.name, location?.address].filter(Boolean).join(', ');
  const image = toPageImage(calendarEvent.image);

  return {
    // As `CalendarEventScreen` titles it
    title: truncateText(calendarEvent.title, 80),
    description: toDescription(
      [
        formatStart(calendarEvent),
        place || (location?.url ? 'Online' : ''),
        `Hosted by ${author.name}`,
        singleLine(calendarEvent.description ?? ''),
      ]
        .filter(Boolean)
        .join(' · '),
    ),
    path,
    type: 'article',
    image: image ?? author.avatar,
    imageAlt: image
      ? `Cover image of ${calendarEvent.title}`
      : `${author.name}'s avatar`,
    largeImage: !!image,
    authorPath: author.path,
  };
}

export const calendarEventMetadata = createAuthoredMetadata(
  'Event',
  Routes.tabs.calendarEvent,
  calendarEventPage,
);
