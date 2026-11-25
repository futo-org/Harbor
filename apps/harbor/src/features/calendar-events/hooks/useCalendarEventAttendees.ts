import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { decodeBundle } from '@/src/common/lib/polycentric-hooks/helpers';
import { useQuery } from '@/src/common/query/hooks/useQuery';
import { Query, v2 } from '@polycentric/react-native-sdk';
import { useMemo } from 'react';
import type { CalendarEventData } from '../lib/calendar-event';
import {
  NO_EVENT_KEY,
  calendarQueryKeys,
  queryEventKey,
} from '../lib/calendar-queries';
import useCalendarStore from './useCalendarStore';

type RsvpStatus = v2.CalendarEventRsvpStatus;

/** RSVP options, in display order */
export const RSVP_STATUSES = [
  { status: v2.CalendarEventRsvpStatus.GOING, label: 'Going' },
  { status: v2.CalendarEventRsvpStatus.MAYBE, label: 'Maybe' },
  { status: v2.CalendarEventRsvpStatus.NOT_GOING, label: "Can't go" },
] as const;

/** Hosts are listed separately and aren't counted */
const HOSTING_GROUP = {
  status: v2.CalendarEventRsvpStatus.HOSTING,
  label: 'Hosting',
} as const;

/** Max attendees we list. Counts cover the rest */
const PAGE_SIZE = 200;

type AttendeeGroup = ((typeof RSVP_STATUSES)[number] | typeof HOSTING_GROUP) & {
  /** Listed identities, us first */
  identities: string[];
  /** Total, including any not listed */
  count: number;
};

type Attendees = {
  groups: AttendeeGroup[];
  /** Confirmed hosts */
  hosting: AttendeeGroup;
  total: number;
};

/** Decode who answered what */
function decodeAnswers(data: ArrayBuffer | undefined): Map<string, RsvpStatus> {
  const answers = new Map<string, RsvpStatus>();
  if (!data || data.byteLength === 0) return answers;

  try {
    const { eventBundles } = v2.ListCalendarEventAttendeesResponse.fromBinary(
      new Uint8Array(data),
    );

    for (const bundle of eventBundles) {
      const decoded = decodeBundle(bundle, 'calendarEventRsvp');
      const identity = decoded?.event.key?.identity;
      if (decoded && identity) answers.set(identity, decoded.content.status);
    }
  } catch {
    // Ignore a bad response
  }

  return answers;
}

/** Group the answers. Our own answer is the local one, as it may not have synced */
function groupAttendees(
  event: CalendarEventData | null,
  answers: Map<string, RsvpStatus>,
  self: string | null,
  ownAnswer: RsvpStatus | undefined,
): Attendees {
  const servedOwnAnswer = self ? answers.get(self) : undefined;

  if (self) {
    if (ownAnswer === undefined) answers.delete(self);
    else answers.set(self, ownAnswer);
  }

  const withStatus = (status: RsvpStatus) =>
    [...answers]
      .filter(([, answer]) => answer === status)
      .map(([identity]) => identity)
      // Us first, then stable order
      .sort((a, b) => (a === self ? -1 : b === self ? 1 : a.localeCompare(b)));

  // Adjust the server count for our own answer if it hasn't synced
  const adjusted = (status: RsvpStatus, servedCount: number) =>
    servedCount +
    (ownAnswer === status ? 1 : 0) -
    (servedOwnAnswer === status ? 1 : 0);

  const servedCounts = event?.server && [
    event.server.goingCount,
    event.server.maybeCount,
    event.server.notGoingCount,
  ];

  const groups = RSVP_STATUSES.map((option, index) => {
    const identities = withStatus(option.status);

    const count = servedCounts
      ? Math.max(
          identities.length,
          adjusted(option.status, servedCounts[index] ?? 0),
        )
      : identities.length;

    return { ...option, identities, count };
  });

  // Only named hosts count. The creator doesn't need to RSVP
  const accepted = withStatus(HOSTING_GROUP.status).filter(
    (identity) =>
      event?.hosts.includes(identity) && identity !== event.identity,
  );

  const hosts = event?.hosts.includes(event.identity)
    ? [event.identity, ...accepted]
    : accepted;

  return {
    groups,
    hosting: { ...HOSTING_GROUP, identities: hosts, count: hosts.length },
    total: groups.reduce((sum, group) => sum + group.count, 0),
  };
}

/** Attendees grouped by answer */
export function useCalendarEventAttendees(
  event: CalendarEventData | null,
): Attendees {
  const { identityKey } = useCurrentIdentity();

  const ownAnswer = useCalendarStore((s) =>
    event ? s.rsvps.get(event.id) : undefined,
  );

  const eventKey = useMemo(() => queryEventKey(event?.id), [event?.id]);

  const query = useQuery(
    calendarQueryKeys.attendees(event?.id ?? ''),
    new Query.ListCalendarEventAttendees({
      eventKey: eventKey ?? NO_EVENT_KEY,
      status: undefined,
      limit: PAGE_SIZE,
      backwardToken: undefined,
      forwardToken: undefined,
    }),
    undefined,
    !!eventKey,
  );

  return useMemo(
    () =>
      groupAttendees(event, decodeAnswers(query.data), identityKey, ownAnswer),
    [event, query.data, identityKey, ownAnswer],
  );
}
