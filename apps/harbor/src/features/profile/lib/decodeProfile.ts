import { v2 } from '@polycentric/react-native';
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

// Every subscriber of a profile query shares the same response buffer, so
// one decode serves all of them (name, avatar, quote header, …).
const decodeCache = new WeakMap<ArrayBuffer | Uint8Array, DecodedProfile>();

/**
 * Decode a serialised `GetProfileResponse` into a flattened profile
 * snapshot using only the highest-sequence `ProfileUpdate` event; older
 * updates are ignored.
 */
export function decodeProfile(bytes: ArrayBuffer | Uint8Array): DecodedProfile {
  const cached = decodeCache.get(bytes);
  if (cached) return cached;

  const response = v2.GetProfileResponse.fromBinary(
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
  );

  let latest: { sequence: bigint; update: v2.ProfileUpdate } | null = null;
  for (const bundle of response.eventBundles) {
    if (!bundle.signedEvent || !bundle.serializedContent?.contentBytes)
      continue;
    try {
      const event = v2.Event.fromBinary(bundle.signedEvent.eventBytes);
      if (!event.key) continue;
      const content = v2.Content.fromBinary(
        bundle.serializedContent.contentBytes,
      );
      if (content.contentBody.oneofKind !== 'profileUpdate') continue;
      const sequence = event.key.sequence;
      if (!latest || sequence > latest.sequence) {
        latest = { sequence, update: content.contentBody.profileUpdate };
      }
    } catch {}
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
  decodeCache.set(bytes, decoded);
  return decoded;
}
