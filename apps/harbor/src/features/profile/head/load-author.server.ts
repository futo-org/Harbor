import { hasModerationLabel, toHeadImage } from '@/src/common/lib/head/content';
import { unaryCall } from '@/src/common/lib/head/unary-call.server';
import {
  decodeBundle,
  shortenIdentityId,
} from '@/src/common/lib/polycentric-hooks/helpers';
import { isIdentityKey } from '@/src/common/util/isIdentityKey';
import { v2 } from '@polycentric/react-native-sdk';
import { normalizeAlias } from '@/src/features/profile/alias/helpers';
import type { Author } from './index';
import { resolveAlias } from '@/src/features/profile/alias/resolve-alias.server';

/** `identityId` is the URL's identity key or alias. Null if there's no such profile */
export async function loadAuthor(
  identityId: string,
  signal: AbortSignal,
): Promise<Author | null> {
  const urlAlias = isIdentityKey(identityId)
    ? null
    : normalizeAlias(identityId);
  const identity = isIdentityKey(identityId)
    ? identityId.toLowerCase()
    : urlAlias && (await resolveAlias(urlAlias, signal));
  if (!identity) return null;

  const response = await unaryCall(
    'ProfileService/GetProfile',
    v2.GetProfileRequest,
    v2.GetProfileResponse,
    { identity },
    signal,
  );

  // One profile event per signing key: the newest wins
  const profile = response.eventBundles
    .map((bundle) => decodeBundle(bundle, 'profileUpdate'))
    .filter((decoded) => decoded !== null)
    .sort((a, b) => Number(b.event.createdAt - a.event.createdAt))
    .at(0)?.content;
  if (!profile) return null;

  // An alias only counts when its domain points back at the identity
  const claimedAlias = profile.alias ? normalizeAlias(profile.alias) : null;
  const hasAlias =
    !!claimedAlias &&
    (claimedAlias === urlAlias ||
      (await resolveAlias(claimedAlias, signal)) === identity);
  const handle = hasAlias ? claimedAlias : shortenIdentityId(identity);

  return {
    identity,
    name: profile.name || handle,
    handle,
    path: `/${hasAlias ? claimedAlias : identity}`,
    description: profile.description ?? '',
    avatar: toHeadImage(profile.avatar),
    followersCount: Number(response.followersCount),
    followingCount: Number(response.followingCount),
    sensitive: hasModerationLabel(response.eventHints),
  };
}
