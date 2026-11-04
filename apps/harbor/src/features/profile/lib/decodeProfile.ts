import type { v2 } from '@polycentric/react-native';
import { decodeBundle } from '@/src/common/lib/polycentric-hooks/helpers';
import { truncateText } from '@/src/common/util/truncateText';

export const MAX_NAME_LENGTH = 50;
export const MAX_BIO_LENGTH = 160;

export type DecodedProfile = {
  name: string | null;
  description: string | null;
  avatar: v2.ImageSet | null;
  banner: v2.ImageSet | null;
  alias: string | null;
  followingCount: number;
  followersCount: number;
};

// Every subscriber of a profile query shares the same response object, so
// one decode serves all of them (name, avatar, quote header, …).
const decodeCache = new WeakMap<v2.GetProfileResponse, DecodedProfile>();

/** Whether a profile response carries anything; a local miss emits an
 *  empty one. */
export function isProfileResponseEmpty(
  response: v2.GetProfileResponse,
): boolean {
  return (
    response.eventBundles.length === 0 &&
    response.eventHints.length === 0 &&
    response.followingCount === 0n &&
    response.followersCount === 0n
  );
}

/**
 * Flatten a `GetProfileResponse` into a profile snapshot using only the
 * highest-sequence `ProfileUpdate` event; older updates are ignored.
 */
export function decodeProfile(response: v2.GetProfileResponse): DecodedProfile {
  const cached = decodeCache.get(response);
  if (cached) return cached;

  let latest: { sequence: bigint; update: v2.ProfileUpdate } | null = null;
  for (const bundle of response.eventBundles) {
    const decoded = decodeBundle(bundle, 'profileUpdate');
    const key = decoded?.event.key;
    if (!decoded || !key) continue;
    if (!latest || key.sequence > latest.sequence) {
      latest = { sequence: key.sequence, update: decoded.content };
    }
  }

  const decoded: DecodedProfile = {
    name: latest?.update.name
      ? truncateText(latest.update.name, MAX_NAME_LENGTH)
      : null,
    description: latest?.update.description
      ? truncateText(latest?.update.description, MAX_BIO_LENGTH)
      : null,
    avatar: latest?.update.avatar ?? null,
    banner: latest?.update.banner ?? null,
    alias: latest?.update.alias ?? null,
    followingCount: Number(response.followingCount),
    followersCount: Number(response.followersCount),
  };
  decodeCache.set(response, decoded);
  return decoded;
}
