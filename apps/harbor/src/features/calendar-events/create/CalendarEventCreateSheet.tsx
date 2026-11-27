import { Button, Text } from '@/src/common/components';
import { Sheet } from '@/src/common/components/sheet';
import { useToast } from '@/src/common/components/toast';
import { Routes } from '@/src/common/constants';
import { Atoms, useTheme } from '@/src/common/theme';
import { router } from 'expo-router';
import { useRef } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  type TextInputInstance,
} from 'react-native';
import { CalendarEventFormFields } from './CalendarEventFormFields';
import { useCalendarEventCreateForm } from '../hooks/useCalendarEventCreateForm';

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

  const {
    form,
    patch,
    coverPhoto,
    error,
    isPending,
    canSubmit,
    submit,
    reset,
  } = useCalendarEventCreateForm();

  const titleRef = useRef<TextInputInstance>(null);

  // Sheet stays mounted when closed, so reset
  const close = () => {
    onClose();
    reset();
  };

  const create = async () => {
    const created = await submit();
    if (!created) return;

    toast.success('Event created');
    close();

    router.navigate(
      Routes.tabs.calendarEvent(
        created.identity,
        created.keyFingerprint,
        created.sequence,
      ),
    );
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      detents={[1]}
      onPresented={() => titleRef.current?.focus()}
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
                onPress={() => void create()}
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
            titleRef={titleRef}
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
