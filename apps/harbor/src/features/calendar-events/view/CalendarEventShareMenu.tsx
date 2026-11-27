import { Text } from '@/src/common/components';
import DropdownMenu from '@/src/common/components/DropdownMenu';
import Icon from '@/src/common/components/Icon';
import { openCompose } from '@/src/common/constants';
import { canShareUrl, nativeShareUrl } from '@/src/common/util/nativeShareUrl';
import PostActionButton from '@/src/features/post/toolbar/PostActionButton';
import {
  type CalendarEventData,
  calendarEventLink,
} from '../lib/calendar-event';

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
          <DropdownMenu.Item
            onPress={() => nativeShareUrl(calendarEventLink(event))}
          >
            <Icon name="share" color="muted" size={16} />
            <Text fontWeight="bold">Share link</Text>
          </DropdownMenu.Item>
        ) : null}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
