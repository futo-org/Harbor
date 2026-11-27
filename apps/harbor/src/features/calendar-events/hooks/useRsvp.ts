import { toast } from '@/src/common/components/toast/useToast';
import { withIdentity } from '@/src/common/lib/authGate';
import {
  useCurrentIdentity,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import type { v2 } from '@polycentric/react-native-sdk';
import { useCallback, useEffect, useState } from 'react';
import { setRsvp } from '../lib/calendar-actions';
import useCalendarStore from './useCalendarStore';

/** Our RSVP for an event */
export function useRsvp(eventId: string | undefined) {
  const client = usePolycentric();
  const { identityKey } = useCurrentIdentity();

  const status = useCalendarStore((s) =>
    eventId ? s.rsvps.get(eventId) : undefined,
  );

  const [isPending, setPending] = useState(false);

  // Local read, so cheap
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-read for a new identity
  useEffect(() => {
    useCalendarStore.getState().refreshOwn(client);
  }, [client, identityKey]);

  /** Same answer again withdraws it */
  const answer = useCallback(
    (next: v2.CalendarEventRsvpStatus) => {
      if (!eventId || isPending) return;

      withIdentity(async () => {
        setPending(true);

        try {
          await setRsvp(client, eventId, next === status ? null : next);
        } catch (err) {
          console.error(err);
          toast.error("Couldn't save your RSVP. Try again.");
        } finally {
          setPending(false);
        }
      });
    },
    [client, eventId, isPending, status],
  );

  return { status, answer };
}
