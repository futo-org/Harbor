import { useState, useEffect } from 'react';
import {
  useCurrentIdentity,
  useUsername,
  useFollowStatus,
} from './PolycentricProvider';
import { useAuthorFeed } from '../../../features/feed/hooks/useAuthorFeed';
import { useLikesFeed } from '../../../features/feed/hooks/useLikesFeed';
import { useProfile } from '../../../features/profile/hooks/useProfile';
import { identiconUrl, shortenIdentityId } from './helpers';

export type ProfileScreenData = {
  /** v2 identity id (hex) for this profile, or null if none can be resolved. */
  identityKey: string | null;
  isSelf: boolean;
  username: string;
  profile: ReturnType<typeof useProfile>;
  authorFeed: ReturnType<typeof useAuthorFeed>;
  likesFeed: ReturnType<typeof useLikesFeed>;
  followStatus: ReturnType<typeof useFollowStatus>;
  /** Short display string derived from the identity key. */
  short: string;
  avatarUrl: string;
  activeFeed: 'posts' | 'likes';
  setActiveFeed: (tab: 'posts' | 'likes') => void;
};

export function useProfileScreenData(
  identityIdParam: string | undefined,
  options?: { getIsAborted?: () => boolean },
): ProfileScreenData {
  const { identity: selfIdentity } = useCurrentIdentity();

  const isSelf =
    !!identityIdParam && selfIdentity?.identityKey === identityIdParam;

  const getIsAborted = options?.getIsAborted;

  const identityKey = identityIdParam ?? null;

  const fallbackUsername = useUsername(identityKey);
  const profile = useProfile(identityKey);
  const username = profile.name ?? fallbackUsername;
  const authorFeed = useAuthorFeed(identityIdParam, undefined, {
    getIsAborted,
  });
  const likesFeed = useLikesFeed({ enabled: isSelf, getIsAborted });
  const followStatus = useFollowStatus(identityKey);

  const short = identityKey ? shortenIdentityId(identityKey) : '...';
  const avatarUrl = identityKey ? identiconUrl(identityKey) : '';

  const [activeFeed, setActiveFeed] = useState<'posts' | 'likes'>('posts');
  useEffect(() => {
    if (!isSelf) setActiveFeed('posts');
  }, [isSelf]);

  return {
    identityKey,
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
