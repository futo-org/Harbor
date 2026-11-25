import { Button, Text } from '@/src/common/components';
import { Sheet } from '@/src/common/components/sheet';
import { useToast } from '@/src/common/components/toast';
import { Routes } from '@/src/common/constants';
import {
  useCurrentIdentity,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView } from 'react-native';
import { CalendarEventFormFields } from './CalendarEventFormFields';
import { createCalendarEvent } from '../lib/calendar-actions';
import { useCoverPhoto } from '../hooks/useCoverPhoto';
import {
  type CalendarEventForm,
  EMPTY_CALENDAR_EVENT_FORM,
  calendarEventFromForm,
} from '../lib/calendar-event';

type CalendarEventCreateSheetProps = {
  open: boolean;
  onClose: () => void;
};

/** Sheet for creating an event */
export function CalendarEventCreateSheet({
  open,
  onClose,
}: CalendarEventCreateSheetProps) {
  const { theme } = useTheme();
  const toast = useToast();
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

  // Sheet stays mounted when closed, so reset
  const close = () => {
    onClose();
    setForm(EMPTY_CALENDAR_EVENT_FORM);
    coverPhoto.reset();
    setError(null);
  };

  const submit = async () => {
    if (isPending) return;

    const result = calendarEventFromForm(form, identityKey ?? '');

    if ('error' in result) {
      setError(result.error);
      return;
    }

    setPending(true);

    try {
      const [image] = await coverPhoto.resolveImageSets();

      const created = await createCalendarEvent(client, {
        ...result.event,
        image,
      });

      toast.success('Event created');
      close();

      router.navigate(
        Routes.tabs.calendarEvent(
          created.identity,
          created.keyFingerprint,
          created.sequence,
        ),
      );
    } catch (err) {
      console.error(err);
      setError("Couldn't create the event. Try again.");
    } finally {
      setPending(false);
    }
  };

  const canSubmit =
    !!form.title.trim() &&
    !!form.date &&
    (form.allDay || !!form.startTime) &&
    !coverPhoto.isUploading;

  return (
    <Sheet
      open={open}
      onClose={close}
      detents={[1]}
      header={
        <Sheet.Header
          title="New event"
          onClose={close}
          disabled={isPending}
          right={
            isPending ? (
              <ActivityIndicator
                size="small"
                color={theme.colors.accent}
                accessibilityLabel="Creating event"
              />
            ) : (
              <Button
                title="Create"
                variant="primary"
                size="sm"
                testID="calendar-event-create-submit"
                disabled={!canSubmit}
                onPress={() => void submit()}
              />
            )
          }
        />
      }
    >
      <Sheet.Content scrollable={false} style={{ padding: 0 }}>
        {/* RN's ScrollView, so TrueSheet finds it to pin and inset. */}
        <ScrollView
          style={Atoms.flex_1}
          contentContainerStyle={[Atoms.p_lg, Atoms.gap_md]}
          keyboardShouldPersistTaps="handled"
        >
          <CalendarEventFormFields
            form={form}
            onChange={patch}
            coverPhoto={coverPhoto}
            disabled={isPending}
          />
          {error ? (
            <Text variant="body" color="danger">
              {error}
            </Text>
          ) : null}
        </ScrollView>
      </Sheet.Content>
    </Sheet>
  );
}
