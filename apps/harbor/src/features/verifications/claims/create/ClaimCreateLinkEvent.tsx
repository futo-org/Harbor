import { useCalendarEventById } from '@/src/features/calendar-events/hooks/useCalendarEventById';
import type { CalendarEventData } from '@/src/features/calendar-events/lib/calendar-event';
import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import type { ClaimLinkEvent } from '../link/lib/claim-link';

type ClaimCreateLinkEventProps = {
  event: ClaimLinkEvent;
  onLoaded: (event: CalendarEventData) => void;
  onMissing: () => void;
};

/** Loads the event an attendance claim link points at */
export function ClaimCreateLinkEvent({
  event: { identity, keyFingerprint, sequence },
  onLoaded,
  onMissing,
}: ClaimCreateLinkEventProps) {
  const { event, isLoading } = useCalendarEventById(
    identity,
    keyFingerprint,
    sequence,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: once, when the load settles
  useEffect(() => {
    if (event) onLoaded(event);
    else if (!isLoading) onMissing();
  }, [event?.id, isLoading]);

  return <ActivityIndicator accessibilityLabel="Loading event" />;
}
