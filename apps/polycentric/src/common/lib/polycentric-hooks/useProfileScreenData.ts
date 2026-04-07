import { useMemo, useState, useEffect } from 'react';
import { types } from '@polycentric/react-native';
import {
  useCurrentIdentity,
  useUsername,
  useProfile,
  useAuthorFeed,
  useLikesFeed,
  useFollowStatus,
} from './PolycentricProvider';
import {
  getIdentityId,
  identiconUrl,
  stringURLSafeToPublicKey,
} from './helpers';

export type ProfileScreenData = {
  publicKey: types.PublicKey;
  isSelf: boolean;
  username: string;
  profile: ReturnType<typeof useProfile>;
  authorFeed: ReturnType<typeof useAuthorFeed>;
  likesFeed: ReturnType<typeof useLikesFeed>;
  followStatus: ReturnType<typeof useFollowStatus>;
  short: string;
  avatarUrl: string;
  activeFeed: 'posts' | 'likes';
  setActiveFeed: (tab: 'posts' | 'likes') => void;
};

export function useProfileScreenData(
  publicKeyParam: string | undefined,
  options?: { getIsAborted?: () => boolean },
): ProfileScreenData {
  const publicKey = useMemo(
    () =>
      publicKeyParam
        ? stringURLSafeToPublicKey(publicKeyParam)
        : types.PublicKey.create(),
    [publicKeyParam],
  );

  const { isCurrentIdentity } = useCurrentIdentity();
  const isSelf = isCurrentIdentity(publicKey);
  const getIsAborted = options?.getIsAborted;

  const username = useUsername(publicKey);
  const profile = useProfile(publicKey, { getIsAborted });
  const authorFeed = useAuthorFeed(publicKey, undefined, { getIsAborted });
  const likesFeed = useLikesFeed({ enabled: isSelf, getIsAborted });
  const followStatus = useFollowStatus(publicKey);

  const short = getIdentityId(publicKey);
  const avatarUrl = identiconUrl(publicKey);

  const [activeFeed, setActiveFeed] = useState<'posts' | 'likes'>('posts');
  useEffect(() => {
    if (!isSelf) setActiveFeed('posts');
  }, [isSelf]);

  return {
    publicKey,
    isSelf,
    username,
    profile,
    authorFeed,
    likesFeed,
    followStatus,
    short,
    avatarUrl,
    activeFeed,
    setActiveFeed,
  };
}
