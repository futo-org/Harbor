import { useMemo, useState, useEffect } from 'react';
import { types } from '@polycentric/react-native';
import {
  usePolycentricContext,
  useCurrentIdentity,
  useUsername,
  useProfile,
  useAuthorFeed,
  useLikesFeed,
  useFollowStatus,
} from './PolycentricProvider';
import { getIdentityId, identiconUrl, shortenIdentityId } from './helpers';
import { useStore } from './store';

export type ProfileScreenData = {
  publicKey: types.PublicKey;
  /** v2 identity id (hex) for this profile, or null if none can be resolved. */
  identityKey: string | null;
  isSelf: boolean;
  username: string;
  profile: ReturnType<typeof useProfile>;
  authorFeed: ReturnType<typeof useAuthorFeed>;
  likesFeed: ReturnType<typeof useLikesFeed>;
  followStatus: ReturnType<typeof useFollowStatus>;
  /** Short display string — identity id when known, pubkey short otherwise. */
  short: string;
  avatarUrl: string;
  activeFeed: 'posts' | 'likes';
  setActiveFeed: (tab: 'posts' | 'likes') => void;
};

export function useProfileScreenData(
  identityIdParam: string | undefined,
  options?: { getIsAborted?: () => boolean },
): ProfileScreenData {
  const { identity: selfIdentity, publicKey: selfPublicKey } =
    useCurrentIdentity();

  // Resolve identityId → publicKey. For self we use the current identity's
  // public key. Otherwise scan known posts for a matching authorIdentity.
  const { store } = usePolycentricContext();
  const knownPublicKey = useStore(store, (state) => {
    if (!identityIdParam) return null;
    for (const post of Object.values(state.posts)) {
      if (post.decoded.authorIdentity === identityIdParam) {
        return post.decoded.authorPublicKey;
      }
    }
    return null;
  });

  const isSelf =
    !!identityIdParam && selfIdentity?.identityKey === identityIdParam;

  const publicKey = useMemo(() => {
    if (isSelf && selfPublicKey) return selfPublicKey;
    return knownPublicKey ?? types.PublicKey.create();
  }, [isSelf, selfPublicKey, knownPublicKey]);

  const getIsAborted = options?.getIsAborted;

  const username = useUsername(publicKey);
  const profile = useProfile(publicKey, { getIsAborted });
  const authorFeed = useAuthorFeed(identityIdParam, undefined, {
    getIsAborted,
  });
  const likesFeed = useLikesFeed({ enabled: isSelf, getIsAborted });
  const followStatus = useFollowStatus(publicKey);

  const identityKey = identityIdParam ?? null;

  const short = identityKey
    ? shortenIdentityId(identityKey)
    : getIdentityId(publicKey);
  const avatarUrl = identiconUrl(publicKey);

  const [activeFeed, setActiveFeed] = useState<'posts' | 'likes'>('posts');
  useEffect(() => {
    if (!isSelf) setActiveFeed('posts');
  }, [isSelf]);

  return {
    publicKey,
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
