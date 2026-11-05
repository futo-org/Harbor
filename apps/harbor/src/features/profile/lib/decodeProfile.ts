import {
  COLLECTION,
  labelsFromGetProfileResponse,
  type PostLabel,
  v2,
} from '@polycentric/react-native';
import {
  eventKeyId,
  labelMapFromSets,
} from '@/src/common/lib/polycentric-hooks/helpers';
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
  /** The identity's first event's key id, the target of reports. */
  eventId: string | null;
  /** Labels on the latest profile update, decoded from event hints. */
  labels: PostLabel[];
};

// Every subscriber of a profile query shares the same response buffer, so
// one decode serves all of them (name, avatar, quote header, …).
const decodeCache = new WeakMap<ArrayBuffer | Uint8Array, DecodedProfile>();

function toArrayBuffer(bytes: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (!(bytes instanceof Uint8Array)) return bytes;
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

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

  let latest: { key: v2.EventKey; update: v2.ProfileUpdate } | null = null;
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
      if (!latest || event.key.sequence > latest.key.sequence) {
        latest = { key: event.key, update: content.contentBody.profileUpdate };
      }
    } catch {}
  }

  const labelMap = labelMapFromSets(
    labelsFromGetProfileResponse(toArrayBuffer(bytes)),
  );
  const genesis = genesisKey(response.eventHints);
  const eventId = genesis ? eventKeyId(genesis) : null;

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
    eventId,
    labels: latest ? (labelMap.get(eventKeyId(latest.key)) ?? []) : [],
  };
  decodeCache.set(bytes, decoded);
  return decoded;
}

/** The identity's first event, from the key chain the hints carry. */
function genesisKey(hints: v2.EventHint[]): v2.EventKey | null {
  for (const hint of hints) {
    const signed = hint.eventBundle?.signedEvent;
    if (!signed) continue;
    try {
      const key = v2.Event.fromBinary(signed.eventBytes).key;
      if (key?.collection === COLLECTION.IDENTITY && key.sequence === 1n) {
        return key;
      }
    } catch {}
  }
  return null;
}
