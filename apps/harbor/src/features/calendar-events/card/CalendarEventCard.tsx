import { InlineLink, Text } from '@/src/common/components';
import Icon, { type IconName } from '@/src/common/components/Icon';
import { Routes } from '@/src/common/constants';
import { useUsername } from '@/src/common/lib/polycentric-hooks';
import { useCardLinkPress } from '@/src/common/lib/navigation/useCardLinkPress';
import { Atoms, BorderRadius, useTheme } from '@/src/common/theme';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { CalendarEventCover } from './CalendarEventCover';
import { useCalendarEventHosts } from '../hooks/useCalendarEventHosts';
import {
  type CalendarEventData,
  calendarEventLocationLine,
  formatCalendarEventTime,
  mapUrl,
} from '../lib/calendar-event';

/** Icons share a size so the text lines up */
const ICON_SIZE = 16;
const COVER_WIDTH = 128;

type CalendarEventCardProps = {
  event: CalendarEventData;
  /** Boxed, for inside a post. Off is the list row */
  embedded?: boolean;
  /** Link to the event page */
  linkToEvent?: boolean;
};

/** Event summary card. Used in lists and as the embed in posts */
export function CalendarEventCard({
  event,
  embedded = false,
  linkToEvent = true,
}: CalendarEventCardProps) {
  const { theme } = useTheme();

  const eventRoute = linkToEvent
    ? Routes.tabs.calendarEvent(
        event.identity,
        event.keyFingerprint,
        event.sequence,
      )
    : null;

  const cardLinkProps = useCardLinkPress(eventRoute);
  const location = calendarEventLocationLine(event);
  const point = event.location?.point;
  // Show the first host, or the creator if there isn't one
  const { hosts } = useCalendarEventHosts(event);
  const hostIdentity = hosts[0] ?? event.identity;
  const host = useUsername(hostIdentity);

  return (
    <Pressable
      {...cardLinkProps}
      disabled={!linkToEvent}
      style={({ hovered, pressed }) => [
        embedded
          ? [
              Atoms.rounded_md,
              Atoms.mt_sm,
              Atoms.border,
              Atoms.overflow_hidden,
              theme.atoms.outline,
            ]
          : [
              Atoms.flex_row,
              Atoms.align_center,
              Atoms.gap_md,
              Atoms.px_lg,
              Atoms.py_md,
              Atoms.border_b,
              theme.atoms.box.primary.border,
            ],
        linkToEvent &&
          !embedded &&
          (hovered || pressed) &&
          theme.atoms.box.primary.bg_hover,
      ]}
    >
      <View
        style={[
          Atoms.gap_xs,
          embedded ? [Atoms.p_md, { marginRight: COVER_WIDTH }] : Atoms.flex_1,
        ]}
      >
        <Text variant="body" fontWeight="bold" numberOfLines={2}>
          {/* Anchor on web so it can open in a new tab */}
          {eventRoute ? (
            <InlineLink href={eventRoute} underlineOnHover={false}>
              {event.title}
            </InlineLink>
          ) : (
            event.title
          )}
        </Text>
        <DetailLine icon="calendar">
          {formatCalendarEventTime(event)}
        </DetailLine>
        {location ? (
          <DetailLine icon="location">
            {linkToEvent && point ? (
              <InlineLink href={mapUrl(point)} target="_blank">
                {location}
              </InlineLink>
            ) : (
              location
            )}
          </DetailLine>
        ) : null}
        <DetailLine icon="personOutline">
          {linkToEvent ? (
            <InlineLink href={Routes.tabs.profile(hostIdentity)}>
              {host}
            </InlineLink>
          ) : (
            host
          )}
        </DetailLine>
      </View>
      {/* Cover runs to the edge when embedded, like link previews */}
      <CalendarEventCover
        image={event.image}
        targetSize={256}
        style={
          embedded
            ? [
                Atoms.absolute,
                { top: 0, bottom: 0, right: 0, width: COVER_WIDTH },
              ]
            : {
                width: COVER_WIDTH,
                aspectRatio: 16 / 9,
                borderRadius: BorderRadius.md,
              }
        }
      />
    </Pressable>
  );
}

type DetailLineProps = {
  icon: IconName;
  children: ReactNode;
};

function DetailLine({ icon, children }: DetailLineProps) {
  return (
    <View style={[Atoms.flex_row, Atoms.align_center, Atoms.gap_xs]}>
      <View style={[Atoms.items_center, { width: ICON_SIZE }]}>
        <Icon name={icon} size={ICON_SIZE} color="muted" />
      </View>
      <Text
        variant="secondary"
        color="secondary"
        numberOfLines={1}
        style={Atoms.flex_shrink_1}
      >
        {children}
      </Text>
    </View>
  );
}
