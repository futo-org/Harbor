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
import {
  getIdentityId,
  identiconUrl,
  shortenIdentityId,
  stringURLSafeToPublicKey,
} from './helpers';
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

  const { isCurrentIdentity, identity: selfIdentity } = useCurrentIdentity();
  const isSelf = isCurrentIdentity(publicKey);
  const getIsAborted = options?.getIsAborted;

  const username = useUsername(publicKey);
  const profile = useProfile(publicKey, { getIsAborted });
  const authorFeed = useAuthorFeed(publicKey, undefined, { getIsAborted });
  const likesFeed = useLikesFeed({ enabled: isSelf, getIsAborted });
  const followStatus = useFollowStatus(publicKey);

  // Resolve an identity id for this profile. For self we already know it
  // from the client; for other users we scan locally-known posts for the
  // first one signed by this public key.
  const { store } = usePolycentricContext();
  const postIdentity = useStore(store, (state) => {
    for (const post of Object.values(state.posts)) {
      const key = post.decoded.authorPublicKey.key;
      if (key && bytesEqual(key, publicKey.key ?? new Uint8Array())) {
        return post.decoded.authorIdentity ?? null;
      }
    }
    return null;
  });

  const identityKey = isSelf
    ? (selfIdentity?.identityKey ?? null)
    : postIdentity;

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

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
