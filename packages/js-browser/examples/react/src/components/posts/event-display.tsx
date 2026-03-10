import {
  Event,
  Opinion,
  Pointer,
  Post,
  PublicKey,
  SignedEvent,
} from '@polycentric/js-core';
import { ClientContext } from '../../main';
import { useCallback, useContext, useEffect, useState } from 'react';
import { Identifier } from '../../utils/identities';
import { PostDisplay } from './post-display';
import { encodeBase64, publicKeysAreEqual } from '../../utils/misc';

const OpinionDisplay = ({ eventPointer }: { eventPointer: Pointer }) => {
  const client = useContext(ClientContext);
  const [opinion, setOpinion] = useState<Opinion>(Opinion.UNSPECIFIED);

  const loadOpinion = useCallback(async () => {
    if (!client) return;

    // TODO verify event digest in the rust core
    const opinion = await client.queryCurrentOpinion(eventPointer);

    if (!opinion) return;

    setOpinion(opinion.value[0] as Opinion);
  }, [client]);

  useEffect(() => {
    loadOpinion();
  }, [loadOpinion]);

  const like = async () => {
    if (!client) return;

    if (opinion !== Opinion.LIKE) await client.createLike(eventPointer);
    else await client.createNeutral(eventPointer);
    await loadOpinion();
  };

  const dislike = async () => {
    if (!client) return;

    if (opinion !== Opinion.DISLIKE) await client.createDislike(eventPointer);
    else await client.createNeutral(eventPointer);
    await loadOpinion();
  };

  return (
    <div>
      <button onClick={like}>
        {opinion === Opinion.LIKE ? 'Unlike' : 'Like'}
      </button>
      <button onClick={dislike}>
        {opinion === Opinion.DISLIKE ? 'Undislike' : 'Dislike'}
      </button>
      {/* TODO like/dislike counts */}
    </div>
  );
};

export const EventDisplay = ({ signedEvent }: { signedEvent: SignedEvent }) => {
  const client = useContext(ClientContext);
  const [username, setUsername] = useState<string>('');

  const [deleted, setDeleted] = useState<boolean>(false);

  const event = Event.fromBinary(signedEvent.event);

  const loadUsername = useCallback(async () => {
    if (!client) return;

    if (!event.system) return;

    let username = await client.queryUsername(event.system);

    if (!username) return;

    setUsername(username);
  }, [client, event]);

  const checkIfDeleted = useCallback(async () => {
    if (!client) return;
    const eventPointer: Pointer = client.eventPointer(event);
    setDeleted(client.queryIsDeleted(eventPointer));
  }, [client]);

  useEffect(() => {
    loadUsername();
    checkIfDeleted();
  }, [loadUsername]);

  if (deleted) {
    return (
      <div
        style={{
          border: '1px solid white',
        }}
      >
        Deleted
      </div>
    );
  }

  if (!client) {
    return <div>Client has not been initialized</div>;
  }

  const eventPointer: Pointer = client.eventPointer(event);

  const del = async () => {
    await client.deletePost(eventPointer);
    await checkIfDeleted();
  };

  return (
    <div
      style={{
        border: '1px solid white',
      }}
    >
      {username && <div>username: {username}</div>}
      {event.system && (
        <a href={`/profile/${encodeBase64(PublicKey.toBinary(event.system))}`}>
          user id: {Identifier(event.system)}
        </a>
      )}
      {event.unixMilliseconds && (
        <div>
          timestamp: {new Date(Number(event.unixMilliseconds)).toString()}
        </div>
      )}
      {
        event.contentType === 3 && (
          <PostDisplay post={Post.fromBinary(event.content)}></PostDisplay>
        ) /*TODO make this an enum*/
      }
      <OpinionDisplay eventPointer={eventPointer}></OpinionDisplay>
      {event.system &&
        publicKeysAreEqual(
          client.currentIdentity.keyPair.publicKey,
          event.system,
        ) && <button onClick={del}>Delete</button>}
      <a href={`/event/${encodeBase64(SignedEvent.toBinary(signedEvent))}`}>
        Replies
      </a>
      {/* TODO like count and reply button*/}
    </div>
  );
};
