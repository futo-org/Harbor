import { Text } from '@/src/common/components';
import DropdownMenu from '@/src/common/components/DropdownMenu';
import Icon from '@/src/common/components/Icon';
import { HARBOR_APP_URL, Routes, openCompose } from '@/src/common/constants';
import { canShareUrl, nativeShareUrl } from '@/src/common/util/nativeShareUrl';
import PostActionButton from '@/src/features/post/toolbar/PostActionButton';
import type { CalendarEventData } from '../lib/calendar-event';

/** Public link to the event */
function eventLink(event: CalendarEventData): string {
  return `${HARBOR_APP_URL}${Routes.tabs.calendarEvent(event.identity, event.keyFingerprint, event.sequence)}`;
}

type CalendarEventShareMenuProps = {
  event: CalendarEventData;
};

/** Quote or share link, same as the repost button on posts */
export function CalendarEventShareMenu({ event }: CalendarEventShareMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger asChild>
        <PostActionButton
          icon="repost"
          accessibilityLabel="Quote or share"
          testID="calendar-event-share-menu"
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        align="end"
        side="top"
        // Stop the dropdown stealing focus from the composer on web
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenu.Item
          testID="calendar-event-quote"
          onPress={() => openCompose({ quote: event.id })}
        >
          <Icon name="quote" color="muted" size={16} />
          <Text fontWeight="bold">Quote</Text>
        </DropdownMenu.Item>
        {canShareUrl ? (
          <DropdownMenu.Item onPress={() => nativeShareUrl(eventLink(event))}>
            <Icon name="share" color="muted" size={16} />
            <Text fontWeight="bold">Share link</Text>
          </DropdownMenu.Item>
        ) : null}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
