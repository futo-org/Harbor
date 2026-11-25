import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { v2 } from '@polycentric/react-native-sdk';
import { useMemo } from 'react';
import type { CalendarEventData } from '../lib/calendar-event';
import useCalendarStore from './useCalendarStore';

/** Who is hosting. Could be nobody */
export function useCalendarEventHosts(event: CalendarEventData) {
  const { identityKey } = useCurrentIdentity();
  const ownAnswer = useCalendarStore((s) => s.rsvps.get(event.id));

  return useMemo(() => {
    const creatorHosts = event.hosts.includes(event.identity);
    const isCreator = identityKey === event.identity;
    const isNamed = !!identityKey && event.hosts.includes(identityKey);

    // The creator doesn't need to accept, so only others are asked
    const isAsked = isNamed && !isCreator;

    const accepted =
      isAsked && ownAnswer === v2.CalendarEventRsvpStatus.HOSTING;

    // Creator first, then us, then the rest
    const others = (event.server?.confirmedHosts ?? []).filter(
      (host) => host !== identityKey && host !== event.identity,
    );

    const hosts = [
      ...(creatorHosts ? [event.identity] : []),
      ...(identityKey && accepted ? [identityKey] : []),
      ...others,
    ];

    return {
      /** Empty if the event has no host */
      hosts,
      creatorHosts,
      /** We've been asked to host and haven't answered */
      isAskedToHost: isAsked && ownAnswer === undefined,
      /** We accepted hosting */
      isHosting: accepted,
    };
  }, [event, ownAnswer, identityKey]);
}
