import { Text } from '@/src/common/components';
import { ProfileAvatar } from '@/src/common/components/Avatar/ProfileAvatar';
import { Atoms, useTheme } from '@/src/common/theme';
import { IdentityHandle } from '@/src/features/profile/IdentityHandle';
import { Username } from '@/src/features/profile/Username';
import { View } from 'react-native';
import { useCalendarEventHosts } from '../hooks/useCalendarEventHosts';
import type { CalendarEventData } from '../lib/calendar-event';

type CalendarEventHostsProps = { event: CalendarEventData };

/** Hosts of the event. Shows the creator too if they aren't hosting */
export function CalendarEventHosts({ event }: CalendarEventHostsProps) {
  const { hosts, creatorHosts } = useCalendarEventHosts(event);

  return (
    <View style={Atoms.gap_md}>
      {hosts.map((identity) => (
        <Person key={identity} identity={identity} tag="Host" />
      ))}
      {creatorHosts ? null : (
        <Person identity={event.identity} tag="Created by" leading />
      )}
    </View>
  );
}

type PersonProps = {
  identity: string;
  tag: string;
  /** Tag above the name instead of beside it */
  leading?: boolean;
};

function Person({ identity, tag, leading = false }: PersonProps) {
  const { theme } = useTheme();

  const tagPill = (
    <View
      style={[
        Atoms.rounded_full,
        { paddingHorizontal: 8, paddingVertical: 2 },
        theme.atoms.box.secondary.bg,
      ]}
    >
      <Text variant="small" color="secondary">
        {tag}
      </Text>
    </View>
  );

  return (
    <View style={[Atoms.flex_row, Atoms.align_center, Atoms.gap_md]}>
      <ProfileAvatar
        identityKey={identity}
        size={leading ? 'sm' : 'md'}
        linkToProfile
      />
      <View style={Atoms.items_start}>
        {leading ? (
          <Text variant="small" color="muted">
            {tag}
          </Text>
        ) : null}
        <View style={[Atoms.flex_row, Atoms.align_center, Atoms.gap_sm]}>
          <Username identity={identity} fontWeight="bold" linkToProfile />
          {leading ? null : tagPill}
        </View>
        {leading ? null : <IdentityHandle identity={identity} linkToProfile />}
      </View>
    </View>
  );
}
