import {
  PublicKey,
  Event as ProtobufEvent,
  SignedEvent,
  Pointer,
} from '@polycentric/js-core';
import { useParams } from 'react-router';
import { Profile } from '../components/profiles/profile';
import { decodeBase64 } from '../utils/misc';
import { EventDisplay } from '../components/posts/event-display';
import { GenericFeed } from '../components/feeds/generic-feed';
import { useContext, useRef, useState } from 'react';
import { ClientContext } from '../main';

export const ProfileWrapper = () => {
  const { profile } = useParams();

  if (!profile) {
    return <div>Error: no profile supplied</div>;
  }

  const profileBytes = decodeBase64(profile);
  const profileProtobuf = PublicKey.fromBinary(profileBytes);

  return <Profile profile={profileProtobuf}></Profile>;
};

export const TopicWrapper = () => {
  const client = useContext(ClientContext);
  const { topic } = useParams();

  if (!client) {
    return <div>Error: no client object provided</div>;
  }

  if (!topic) {
    return <div>Error: no topic supplied</div>;
  }

  const topicDecoded = decodeURIComponent(topic);

  return (
    <GenericFeed
      query={client.queryReferencesFeed({
        referenceType: 3n,
        reference: new TextEncoder().encode(topicDecoded),
      })}
    ></GenericFeed>
  );
};

export const EventDisplayWrapper = () => {
  const client = useContext(ClientContext);
  const { eventEncoded } = useParams();

  if (!client) {
    return <div>Error: no client object provided</div>;
  }

  if (!eventEncoded) {
    return <div>Error: no event supplied</div>;
  }

  const signedEvent = SignedEvent.fromBinary(decodeBase64(eventEncoded));
  const event = ProtobufEvent.fromBinary(signedEvent.event);

  return (
    <div>
      <EventDisplay signedEvent={signedEvent}></EventDisplay>
      <GenericFeed
        query={client.queryReferencesFeed({
          referenceType: 2n,
          reference: Pointer.toBinary(client.eventPointer(event)),
        })}
      ></GenericFeed>
    </div>
  );
};

export const SearchFeedWrapper = () => {
  const client = useContext(ClientContext);

  const [query, setQuery] = useState<string>('');
  const queryRef = useRef<HTMLInputElement | null>(null);

  if (!client) {
    return <div>Error: no client object provided</div>;
  }

  const search = () => {
    if (queryRef.current) {
      setQuery(queryRef.current.value);
    }
  };

  return (
    <div>
      <input ref={queryRef} onInput={search}></input>
      {query && (
        <GenericFeed
          query={client?.querySearch(query, 'messages')}
        ></GenericFeed>
      )}
    </div>
  );
};
