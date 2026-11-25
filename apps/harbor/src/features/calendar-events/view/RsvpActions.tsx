import { Text } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Atoms, useTheme } from '@/src/common/theme';
import { Pressable, View } from 'react-native';
import type { v2 } from '@polycentric/react-native-sdk';
import { RSVP_STATUSES } from '../hooks/useCalendarEventAttendees';

type RsvpActionsProps = {
  status: v2.CalendarEventRsvpStatus | undefined;
  answer: (status: v2.CalendarEventRsvpStatus) => void;
};

/** RSVP buttons. Tap the selected one again to withdraw */
export function RsvpActions({ status, answer }: RsvpActionsProps) {
  const { theme } = useTheme();
  // Selected button uses inverted colours
  const onChosen = theme.colors.box.primary.bg;

  return (
    <View style={[Atoms.flex_row, Atoms.gap_sm]}>
      {RSVP_STATUSES.map((option) => {
        const chosen = status === option.status;
        return (
          <Pressable
            key={option.status}
            accessibilityRole="button"
            aria-pressed={chosen}
            testID={`calendar-event-rsvp-${option.status}`}
            onPress={() => answer(option.status)}
            style={({ hovered, pressed }) => [
              Atoms.flex_1,
              Atoms.flex_row,
              Atoms.align_center,
              Atoms.justify_center,
              Atoms.gap_xs,
              Atoms.rounded_full,
              Atoms.border,
              { paddingVertical: 10 },
              chosen
                ? {
                    backgroundColor: theme.colors.primary,
                    borderColor: theme.colors.primary,
                  }
                : [
                    theme.atoms.outline_strong,
                    (hovered || pressed) && theme.atoms.box.primary.bg_hover,
                  ],
            ]}
          >
            {chosen ? (
              <Icon name="checkmark" size={16} customColor={onChosen} />
            ) : null}
            <Text
              variant="secondary"
              fontWeight="bold"
              numberOfLines={1}
              selectable={false}
              style={chosen && { color: onChosen }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
