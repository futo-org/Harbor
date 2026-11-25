import { getKeyFingerprint } from '@/src/common/lib/polycentric-hooks/helpers';
import { CalendarEventEmbed } from '@/src/features/calendar-events/card/CalendarEventEmbed';
import { usePostById } from '@/src/features/post/hooks/usePostById';
import { COLLECTION, type v2 } from '@polycentric/react-native-sdk';
import ComposerPostEmbed from './ComposerPostEmbed';

type ComposerQuoteProps = { eventKey: v2.EventKey };

/** Preview of what the post quotes. New kinds go here */
export function ComposerQuote({ eventKey }: ComposerQuoteProps) {
  switch (eventKey.collection) {
    case COLLECTION.FEED:
      return <PostQuote eventKey={eventKey} />;

    case COLLECTION.CALENDAR:
      return <CalendarEventEmbed eventKey={eventKey} linkToEvent={false} />;

    default:
      return null;
  }
}

function PostQuote({ eventKey }: ComposerQuoteProps) {
  const { post } = usePostById(
    eventKey.identity,
    getKeyFingerprint(eventKey.signedBy),
    eventKey.sequence,
  );

  return post ? <ComposerPostEmbed post={post} intentText="Quoting" /> : null;
}
