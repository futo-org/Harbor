import type { PublicKey } from '@polycentric/js-core';
import { ClientContext } from '../../main';
import { useContext, useEffect, useState } from 'react';
import { Identifier } from '../../utils/identities';
import { publicKeysAreEqual } from '../../utils/misc';
import { GenericFeed } from '../feeds/generic-feed';

export const Profile = ({ profile }: { profile: PublicKey }) => {
  const client = useContext(ClientContext);
  const [username, setUsername] = useState<string>('');

  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [isBlocked, setIsBlocked] = useState<boolean | null>(null);

  useEffect(() => {
    const loadUsername = async () => {
      const name = await client?.queryUsername(profile);
      if (name) setUsername(name);
    };

    loadUsername();

    const loadIsFollowing = async () => {
      const followedProfiles = await client?.queryFollows(
        client.currentIdentity.keyPair.publicKey,
      );

      if (!followedProfiles) return;

      for (const followed of followedProfiles) {
        if (publicKeysAreEqual(followed, profile)) {
          setIsFollowing(true);
          return;
        }
      }

      setIsFollowing(false);
    };

    loadIsFollowing();

    const loadIsBlocked = async () => {
      const blockedProfiles = await client?.queryBlocks(
        client.currentIdentity.keyPair.publicKey,
      );

      if (!blockedProfiles) return;

      for (const blocked of blockedProfiles) {
        if (publicKeysAreEqual(blocked, profile)) {
          setIsBlocked(true);
          return;
        }
      }

      setIsBlocked(false);
    };

    loadIsBlocked();
  }, [profile]);

  if (!client) {
    return <div>Error: no client object supplied</div>;
  }

  const follow = async () => {
    await client?.createFollow(profile);
    setIsFollowing(true);
  };

  const unfollow = async () => {
    await client?.createUnfollow(profile);
    setIsFollowing(false);
  };

  const block = async () => {
    await client?.createBlock(profile);
    setIsBlocked(true);
  };

  const unblock = async () => {
    await client?.createUnblock(profile);
    setIsBlocked(false);
  };

  return (
    <div>
      <div>{username}</div>
      <div>{Identifier(profile)}</div>
      {isFollowing && <button onClick={unfollow}>Unfollow</button>}
      {isFollowing === false && <button onClick={follow}>Follow</button>}
      {isBlocked && <button onClick={unblock}>Unblock</button>}
      {isBlocked === false && <button onClick={block}>Block</button>}
      <GenericFeed query={client.queryAuthorFeed(profile, 20)}></GenericFeed>
    </div>
  );
};
