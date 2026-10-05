import { v2 } from '@polycentric/react-native';
import { eventKeyId } from '@/src/common/lib/polycentric-hooks/helpers';
import { truncateText } from '@/src/common/util/truncateText';

export const MAX_NAME_LENGTH = 50;
export const MAX_BIO_LENGTH = 160;

export type DecodedProfile = {
  name: string | null;
  description: string | null;
  avatar: v2.ImageSet | null;
  banner: v2.ImageSet | null;
  alias: string | null;
  knownAs: string | null;
  // The known-as claim with its verifies, from the response hints.
  knownAsClaimBundle: v2.VerificationClaimBundle | null;
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

  let latest: {
    sequence: bigint;
    identity: string;
    update: v2.ProfileUpdate;
  } | null = null;
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
      // On a sequence tie (two devices) the last one wins, as in rs-core.
      if (!latest || sequence >= latest.sequence) {
        latest = {
          sequence,
          identity: event.key.identity,
          update: content.contentBody.profileUpdate,
        };
      }
    } catch {}
  }

  const knownAsKey = latest?.update.knownAs;
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
    knownAs: knownAsKey ? eventKeyId(knownAsKey) : null,
    knownAsClaimBundle:
      // Only the profile owner's own claim can be its known-as.
      knownAsKey && knownAsKey.identity === latest?.identity
        ? findKnownAsClaimBundle(response.eventHints, eventKeyId(knownAsKey))
        : null,
    followingCount: Number(response.followingCount),
    followersCount: Number(response.followersCount),
  };
  decodeCache.set(bytes, decoded);
  return decoded;
}

/** The claim `claimId` and its verify events, from the response hints. */
function findKnownAsClaimBundle(
  eventHints: v2.EventHint[],
  claimId: string,
): v2.VerificationClaimBundle | null {
  let claim: v2.EventBundle | undefined;
  const verifies: v2.EventBundle[] = [];
  for (const { eventBundle } of eventHints) {
    if (
      !eventBundle?.signedEvent ||
      !eventBundle.serializedContent?.contentBytes
    )
      continue;
    try {
      const event = v2.Event.fromBinary(eventBundle.signedEvent.eventBytes);
      const body = v2.Content.fromBinary(
        eventBundle.serializedContent.contentBytes,
      ).contentBody;
      if (
        body.oneofKind === 'verificationClaim' &&
        event.key &&
        eventKeyId(event.key) === claimId
      ) {
        claim = eventBundle;
      } else if (
        body.oneofKind === 'verificationVerify' &&
        body.verificationVerify.claimEventKey &&
        eventKeyId(body.verificationVerify.claimEventKey) === claimId
      ) {
        verifies.push(eventBundle);
      }
    } catch {}
  }
  return claim ? v2.VerificationClaimBundle.create({ claim, verifies }) : null;
}
