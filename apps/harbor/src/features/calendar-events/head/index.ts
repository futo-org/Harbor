import type { HeadImage } from '@/src/common/lib/head/content';
import { toHeadImage } from '@/src/common/lib/head/content';
import { type Head, singleLine, toDescription } from '@/src/common/lib/head';
import { truncateText } from '@/src/common/util/truncateText';
import type { Author } from '@/src/features/profile/head';
import type { v2 } from '@polycentric/react-native-sdk';

export type CalendarEventHeadInput = {
  /** The event's creator */
  author: Author;
  /** Canonical path of the event */
  path: string;
  title: string;
  description?: string;
  /** Ms since the Unix epoch */
  startAt: number;
  allDay: boolean;
  /** IANA timezone of the venue */
  timezone?: string;
  location?: v2.CalendarEventLocation;
  image?: v2.ImageSet;
};

// In the venue's timezone, so the page reads the same for every viewer
function formatStart({
  startAt,
  allDay,
  timezone,
}: Pick<CalendarEventHeadInput, 'startAt' | 'allDay' | 'timezone'>): string {
  const start = new Date(startAt);
  const date = {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  } as const;
  if (allDay) {
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
      timeZone: timezone ?? 'UTC',
    });
  } catch {
    // Not a timezone this runtime knows
    return start.toLocaleString('en-US', { ...time, timeZone: 'UTC' });
  }
}

export function calendarEventHead(input: CalendarEventHeadInput): Head {
  const { author, path, title, description, location } = input;
  const place = [location?.name, location?.address].filter(Boolean).join(', ');
  const image: HeadImage | null = toHeadImage(input.image);

  return {
    title: truncateText(title, 80),
    description: toDescription(
      [
        formatStart(input),
        place || (location?.url ? 'Online' : ''),
        `Hosted by ${author.name}`,
        singleLine(description ?? ''),
      ]
        .filter(Boolean)
        .join(' · '),
    ),
    path,
    type: 'article',
    image: image ?? author.avatar,
    imageAlt: image ? `Cover image of ${title}` : `${author.name}'s avatar`,
    largeImage: !!image,
    authorPath: author.path,
  };
}
