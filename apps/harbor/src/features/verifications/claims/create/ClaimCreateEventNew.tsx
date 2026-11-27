import { Text } from '@/src/common/components';
import { Atoms } from '@/src/common/theme';
import { CalendarEventFormFields } from '@/src/features/calendar-events/create/CalendarEventFormFields';
import { useCalendarEventCreateForm } from '@/src/features/calendar-events/hooks/useCalendarEventCreateForm';
import type { CalendarEventData } from '@/src/features/calendar-events/lib/calendar-event';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

/** What the sheet header needs for its Create button */
export type EventFormState = {
  submit: () => void;
  canSubmit: boolean;
  isPending: boolean;
};

type ClaimCreateEventNewProps = {
  onCreated: (event: CalendarEventData) => void;
  onFormState: (state: EventFormState | null) => void;
};

/** Make the event the claim is about */
export function ClaimCreateEventNew({
  onCreated,
  onFormState,
}: ClaimCreateEventNewProps) {
  const { form, patch, coverPhoto, error, isPending, canSubmit, submit } =
    useCalendarEventCreateForm();

  const create = async () => {
    const created = await submit();
    if (created) onCreated(created);
  };

  // Stable wrapper, as `create` changes every render
  const createRef = useRef(create);

  useEffect(() => {
    createRef.current = create;
  });

  useEffect(() => {
    onFormState({
      submit: () => void createRef.current(),
      canSubmit,
      isPending,
    });

    return () => onFormState(null);
  }, [onFormState, canSubmit, isPending]);

  return (
    <View style={Atoms.gap_md}>
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
    </View>
  );
}
