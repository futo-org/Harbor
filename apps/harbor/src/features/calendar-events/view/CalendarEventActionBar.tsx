import { Text } from '@/src/common/components';
import { Atoms, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarEventAnswer } from './CalendarEventAnswer';
import { CalendarEventShareMenu } from './CalendarEventShareMenu';
import {
  type CalendarEventData,
  formatCalendarEventTime,
} from '../lib/calendar-event';

type CalendarEventActionBarProps = { event: CalendarEventData };

/** Sticky bar with share and RSVP */
export function CalendarEventActionBar({ event }: CalendarEventActionBarProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        Atoms.px_lg,
        Atoms.pt_md,
        Atoms.gap_md,
        Atoms.border_t,
        theme.atoms.box.primary.border,
        theme.atoms.box.primary.bg,
        { paddingBottom: Math.max(insets.bottom, 12) },
        // Web scrolls the document, so stick to the window
        isWeb && { position: 'sticky', bottom: 0 },
      ]}
    >
      <View style={[Atoms.flex_row, Atoms.align_center, Atoms.gap_md]}>
        <View style={Atoms.flex_1}>
          <Text variant="small" color="secondary" numberOfLines={1}>
            {formatCalendarEventTime(event)}
          </Text>
          <Text variant="body" fontWeight="bold" numberOfLines={1}>
            {event.title}
          </Text>
        </View>
        <CalendarEventShareMenu event={event} />
      </View>
      <CalendarEventAnswer event={event} />
    </View>
  );
}
