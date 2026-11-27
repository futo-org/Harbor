import {
  useCurrentIdentity,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { useState } from 'react';
import { createCalendarEvent } from '../lib/calendar-actions';
import {
  type CalendarEventData,
  type CalendarEventForm,
  EMPTY_CALENDAR_EVENT_FORM,
  calendarEventFromForm,
} from '../lib/calendar-event';
import { useCoverPhoto } from './useCoverPhoto';

/** State and submit for the create event form */
export function useCalendarEventCreateForm() {
  const client = usePolycentric();
  const { identityKey } = useCurrentIdentity();
  const [form, setForm] = useState(EMPTY_CALENDAR_EVENT_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setPending] = useState(false);
  const coverPhoto = useCoverPhoto(isPending, setError);

  const patch = (changes: Partial<CalendarEventForm>) => {
    setError(null);
    setForm((prev) => ({ ...prev, ...changes }));
  };

  const reset = () => {
    setForm(EMPTY_CALENDAR_EVENT_FORM);
    coverPhoto.reset();
    setError(null);
  };

  /** The created event, or null if it couldn't be created */
  const submit = async (): Promise<CalendarEventData | null> => {
    if (isPending) return null;

    const result = calendarEventFromForm(form, identityKey ?? '');

    if ('error' in result) {
      setError(result.error);

      return null;
    }

    setPending(true);

    try {
      const [image] = await coverPhoto.resolveImageSets();

      return await createCalendarEvent(client, { ...result.event, image });
    } catch (err) {
      console.error(err);
      setError("Couldn't create the event. Try again.");

      return null;
    } finally {
      setPending(false);
    }
  };

  const canSubmit =
    !!form.title.trim() &&
    !!form.date &&
    (form.allDay || !!form.startTime) &&
    !coverPhoto.isUploading;

  return {
    form,
    patch,
    coverPhoto,
    error,
    isPending,
    canSubmit,
    submit,
    reset,
  };
}
