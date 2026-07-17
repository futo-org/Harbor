import { v2 } from '@polycentric/react-native';

export type DecodedProfile = {
  name: string | null;
  description: string | null;
  avatar: v2.ImageSet | null;
  banner: v2.ImageSet | null;
  alias: string | null;
  followingCount: number;
  followersCount: number;
};

/**
 * Decode a serialised `GetProfileResponse` into a flattened profile
 * snapshot using only the highest-sequence `ProfileUpdate` event; older
 * updates are ignored.
 */
export function decodeProfile(bytes: ArrayBuffer | Uint8Array): DecodedProfile {
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

  return {
    name: latest?.update.name ?? null,
    description: latest?.update.description ?? null,
    avatar: latest?.update.avatar ?? null,
    banner: latest?.update.banner ?? null,
    alias: latest?.update.alias ?? null,
    followingCount: Number(response.followingCount),
    followersCount: Number(response.followersCount),
  };
}
