import { InlineLink, Text } from '@/src/common/components';
import Icon, { type IconName } from '@/src/common/components/Icon';
import { Atoms, BorderRadius, useTheme } from '@/src/common/theme';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  type CalendarEventData,
  formatCalendarEventDate,
  formatCalendarEventHours,
  isWebUrl,
  mapUrl,
} from '../lib/calendar-event';

type CalendarEventInfoProps = { event: CalendarEventData };

/** When and where */
export function CalendarEventInfo({ event }: CalendarEventInfoProps) {
  const { theme } = useTheme();
  const { name, address, url, point } = event.location ?? {};

  return (
    <View
      style={[
        Atoms.p_lg,
        Atoms.gap_lg,
        { borderRadius: BorderRadius.lg },
        theme.atoms.box.secondary.bg,
      ]}
    >
      <InfoRow icon="calendar">
        <Text variant="body" fontWeight="semibold">
          {formatCalendarEventDate(event)}
        </Text>
        <Text variant="secondary" color="secondary">
          {formatCalendarEventHours(event)}
        </Text>
      </InfoRow>
      {name || address || point ? (
        <InfoRow icon="location">
          {name ? (
            <Text variant="body" fontWeight="semibold" selectable>
              {point ? (
                <InlineLink href={mapUrl(point)} target="_blank">
                  {name}
                </InlineLink>
              ) : (
                name
              )}
            </Text>
          ) : null}
          {address ? (
            <Text variant="secondary" color="secondary" selectable>
              {address}
            </Text>
          ) : null}
          {point ? <LinkText href={mapUrl(point)}>Open in map</LinkText> : null}
        </InfoRow>
      ) : null}
      {url ? (
        <InfoRow icon="globe">
          <Text variant="body" fontWeight="semibold">
            Online event
          </Text>
          {isWebUrl(url) ? (
            <LinkText href={url}>{url}</LinkText>
          ) : (
            <Text variant="secondary" color="secondary" selectable>
              {url}
            </Text>
          )}
        </InfoRow>
      ) : null}
    </View>
  );
}

type InfoRowProps = { icon: IconName; children: ReactNode };

function InfoRow({ icon, children }: InfoRowProps) {
  return (
    <View style={[Atoms.flex_row, Atoms.gap_md]}>
      <View style={{ paddingTop: 2 }}>
        <Icon name={icon} size={22} color="secondary" />
      </View>
      <View style={[Atoms.flex_1, Atoms.gap_2xs]}>{children}</View>
    </View>
  );
}

type LinkTextProps = {
  href: `https://${string}` | `http://${string}`;
  children: ReactNode;
};

function LinkText({ href, children }: LinkTextProps) {
  return (
    <Text variant="secondary" color="accent">
      <InlineLink href={href} target="_blank">
        {children}
      </InlineLink>
    </Text>
  );
}
