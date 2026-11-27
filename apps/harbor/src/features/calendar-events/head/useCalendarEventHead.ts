import { Routes } from '@/src/common/constants';
import type { Head } from '@/src/common/lib/head';
import { useAuthoredHead } from '@/src/features/profile/head/useAuthoredHead';
import type { CalendarEventData } from '@/src/features/calendar-events/lib/calendar-event';
import { calendarEventHead } from './index';

/** The head of the event the screen has loaded. Null while loading */
export function useCalendarEventHead(
  event: CalendarEventData | null,
  isLoading: boolean,
): Head | null {
  return useAuthoredHead('Event', event, isLoading, (author, loaded) =>
    calendarEventHead({
      author,
      path: Routes.tabs.calendarEvent(
        loaded.identity,
        loaded.keyFingerprint,
        loaded.sequence,
      ),
      title: loaded.title,
      description: loaded.description,
      startAt: loaded.startAt,
      allDay: loaded.allDay,
      timezone: loaded.timezone,
      location: loaded.location,
      image: loaded.image,
    }),
  );
}
