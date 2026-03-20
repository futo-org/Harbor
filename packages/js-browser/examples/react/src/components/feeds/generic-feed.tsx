import { useCallback, useEffect, useState } from 'react';
import { SignedEvent, type FeedQuery } from '@polycentric/js-core';
import { EventDisplay } from '../posts/event-display';
import { Base64 } from 'js-base64';

export const GenericFeed = ({ query }: { query: FeedQuery }) => {
  const [feed, setFeed] = useState<SignedEvent[]>([]);

  const loadFeed = useCallback(async () => {
    const newFeed = feed.slice();

    let events = await query.read();

    newFeed.push(...events);
    setFeed(newFeed);
  }, [query, feed]);

  useEffect(() => {
    loadFeed();
  }, [query]);

  const scrollCallback = () => {
    loadFeed();
  };

  return (
    <div>
      <div
        style={{
          overflowY: 'scroll',
          height: '50vh',
        }}
        onScroll={scrollCallback}
      >
        {feed?.map((evt) => (
          <EventDisplay
            signedEvent={evt}
            key={Base64.fromUint8Array(SignedEvent.toBinary(evt))}
          ></EventDisplay>
        ))}
      </div>
    </div>
  );
};
