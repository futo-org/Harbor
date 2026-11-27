import { Text, TextInput } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { useCalendarEvents } from '@/src/features/calendar-events/hooks/useCalendarEvents';
import { useSearchCalendarEvents } from '@/src/features/calendar-events/hooks/useSearchCalendarEvents';
import {
  type CalendarEventData,
  calendarEventLocationLine,
  formatCalendarEventTime,
} from '@/src/features/calendar-events/lib/calendar-event';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

type ClaimCreateEventPickerProps = {
  onSelect: (event: CalendarEventData) => void;
  onCreateNew: () => void;
};

/** Find the event the claim is about, or go and make it */
export function ClaimCreateEventPicker({
  onSelect,
  onCreateNew,
}: ClaimCreateEventPickerProps) {
  const [text, setText] = useState('');
  const all = useCalendarEvents();
  const search = useSearchCalendarEvents(text);

  const loaded = search.isSearching ? search.events : all.events;
  const isLoading = search.isSearching ? search.isLoading : all.isLoading;

  // Keep the last list up while the next one loads, so nothing jumps
  const shown = useRef(loaded);
  if (!isLoading) shown.current = loaded;
  const events = shown.current;

  return (
    <View style={Atoms.gap_sm}>
      <View style={[Atoms.px_lg, Atoms.justify_center]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Search events"
          autoCapitalize="none"
          testID="claim-create-event-search"
        />

        {/* Over the input, so it takes no room */}
        {isLoading ? (
          <ActivityIndicator
            size="small"
            style={{ position: 'absolute', right: Spacing.lg + 12 }}
          />
        ) : null}
      </View>

      <View>
        <EventRow
          icon="addCircleOutline"
          title="New event"
          detail="Can't find it below? Add the event, then claim you were there."
          testID="claim-create-event-new"
          onPress={onCreateNew}
        />

        {events.map((event) => (
          <EventRow
            key={event.id}
            icon="calendar"
            title={event.title}
            detail={[
              formatCalendarEventTime(event),
              calendarEventLocationLine(event),
            ]
              .filter(Boolean)
              .join(' · ')}
            testID="claim-create-event-option"
            onPress={() => onSelect(event)}
          />
        ))}
      </View>

      {!isLoading && events.length === 0 ? (
        <Text variant="secondary" color="muted" style={Atoms.px_lg}>
          {search.isSearching ? 'No events found.' : 'No events yet.'}
        </Text>
      ) : null}
    </View>
  );
}

type EventRowProps = {
  icon: 'calendar' | 'addCircleOutline';
  title: string;
  detail: string;
  testID: string;
  onPress: () => void;
};

function EventRow({ icon, title, detail, testID, onPress }: EventRowProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      style={({ hovered, pressed }) => [
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.gap_md,
        Atoms.px_lg,
        Atoms.py_md,
        (hovered || pressed) && theme.atoms.box.primary.bg_hover,
      ]}
    >
      <Icon name={icon} size={22} color="secondary" />

      <View style={Atoms.flex_1}>
        <Text variant="secondary" numberOfLines={1} selectable={false}>
          {title}
        </Text>
        <Text
          variant="small"
          color="secondary"
          fontWeight="regular"
          selectable={false}
        >
          {detail}
        </Text>
      </View>

      <Icon name="chevronForward" size={18} color="muted" />
    </Pressable>
  );
}
