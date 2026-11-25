import { Text } from '@/src/common/components';
import { ProfileAvatar } from '@/src/common/components/Avatar/ProfileAvatar';
import { Atoms, BorderRadius, useTheme } from '@/src/common/theme';
import { IdentityHandle } from '@/src/features/profile/IdentityHandle';
import { Username } from '@/src/features/profile/Username';
import { View } from 'react-native';
import { useCalendarEventAttendees } from '../hooks/useCalendarEventAttendees';
import type { CalendarEventData } from '../lib/calendar-event';

type CalendarEventAttendeesProps = {
  event: CalendarEventData;
};

/** Attendee counts and list */
export function CalendarEventAttendees({ event }: CalendarEventAttendeesProps) {
  const { theme } = useTheme();
  const { groups, hosting, total } = useCalendarEventAttendees(event);

  const listed = [hosting, ...groups].filter(
    (group) => group.identities.length > 0,
  );

  return (
    <View style={Atoms.gap_md} testID="calendar-event-attendees">
      <Text variant="title">Attendees</Text>

      <View style={[Atoms.flex_row, Atoms.gap_sm]}>
        {groups.map((group) => (
          <View
            key={group.status}
            style={[
              Atoms.flex_1,
              Atoms.items_center,
              Atoms.py_md,
              { borderRadius: BorderRadius.lg },
              theme.atoms.box.secondary.bg,
            ]}
          >
            <Text fontSize={22} lineHeight={28} fontWeight="bold">
              {group.count}
            </Text>
            <Text variant="small" color="secondary">
              {group.label}
            </Text>
          </View>
        ))}
      </View>

      {total === 0 && listed.length === 0 ? (
        <Text variant="secondary" color="muted">
          Nobody has answered yet.
        </Text>
      ) : null}
      {listed.map((group) => (
        <View key={group.status} style={Atoms.gap_sm}>
          <Text variant="small" color="secondary">
            {group.label} · {group.count}
          </Text>
          {group.identities.map((identity) => (
            <View
              key={identity}
              style={[Atoms.flex_row, Atoms.align_center, Atoms.gap_md]}
            >
              <ProfileAvatar identityKey={identity} size="sm" linkToProfile />
              <View style={[Atoms.flex_1, Atoms.items_start]}>
                <Username
                  identity={identity}
                  variant="secondary"
                  fontWeight="bold"
                  linkToProfile
                />
                <IdentityHandle identity={identity} linkToProfile />
              </View>
              {identity === event.identity ? (
                <Text variant="small" color="muted">
                  Creator
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
