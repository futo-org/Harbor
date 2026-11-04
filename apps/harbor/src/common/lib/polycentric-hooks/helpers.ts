import {
  type LabelSet,
  type PostLabel,
  type QueryData,
  QueryData_Tags,
  type QueryStatus,
  eventKeyId as ffiEventKeyId,
  type v2,
} from '@polycentric/react-native';
import type { UseQueryResult } from '@/src/common/query/hooks/useQuery';

/** Bytes from rs-core arrive as `ArrayBuffer`s; these accept either. */
type Bytes = ArrayBuffer | Uint8Array;

export function asBytes(bytes: Bytes): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

/** A copy of `bytes` as the `ArrayBuffer` rs-core takes. */
export function asBuffer(bytes: Bytes): ArrayBuffer {
  return asBytes(bytes).slice().buffer as ArrayBuffer;
}

export function toBase64(bytes: Bytes): string {
  return btoa(String.fromCharCode.apply(null, Array.from(asBytes(bytes))));
}

export function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export type PostData = {
  /** `eventKeyId` of the event key */
  id: string;

  identity: v2.EventKey['identity'];
  signedBy: v2.PublicKey;
  sequence: string;

  content: string;
  createdAt: number;

  /** App that authored the event, if reported. */
  application?: v2.Application;

  /** Attached image sets, in author-provided order. */
  images: v2.ImageSet[];

  /** Attached link previews (Open Graph metadata), in author-provided order. */
  links: v2.Link[];

  /** Set when the underlying `v2.Post` carried a `reply`. */
  reply?: {
    /** Id of the root post's EventKey — same encoding as `PostData.id`. */
    rootId?: string;
    /** Id of the parent post's EventKey — same encoding as `PostData.id`. */
    parentId?: string;
  };

  /** Id of the quoted post's EventKey — same encoding as `PostData.id`. */
  quoteId?: string;

  /** Quoted post resolved from the feed's `event_hints`, when the server
   *  shipped it alongside — lets the quote box render without a fetch. */
  quotePost?: PostData;

  /** Identity that reposted this post, when this item represents a
   *  repost. The rest of the fields are the *reposted* post's data. */
  repostedBy?: string;
  /** Id of the repost event's own EventKey — used as the feed list
   *  key so a repost is distinct from the original post. */
  repostId?: string;
  /** When the repost was made. Feeds rank a repost by this, so it is the
   *  time the row shows. */
  repostedAt?: number;

  // --- Metadata that may change ---
  // Events and content are immutable, but metadata can be updated over time.
  // We should still create a new PostData object with the updated metadata
  // instead of directly mutating existing objects.

  /** Our estimation for how many replies this post has. */
  replyCount?: number;

  /** Our estimation for how many reactions this post has. */
  totalReactionCount?: number;

  /** Our estimation for how many positive reactions this post has. */
  upvoteCount?: number;

  /** Our estimation for how many negative reactions this post has. */
  downvoteCount?: number;

  /** Our estimation for how many reposts this post has. */
  repostCount?: number;

  /** Our estimation for how many quotes this post has. */
  quoteCount?: number;

  /** Our estimation of the per-emoji reaction breakdown, most popular first. */
  reactionTallies?: v2.ReactionTally[];

  // --- End of metadata ---

  signedEvent: v2.SignedEvent;

  /** Labels applied to this post, decoded from event hints. */
  labels?: PostLabel[];
};

export type { LabelSet, PostLabel } from '@polycentric/react-native';

const OWN_APP_ID_PREFIX = 'org.futo.polycentric';

/** The app a post came from; `undefined` for our own builds. */
export function thirdPartyApplication(
  application?: v2.Application,
): { name: string; url?: string } | undefined {
  if (!application || application.id.startsWith(OWN_APP_ID_PREFIX)) {
    return undefined;
  }
  return {
    name: application.name || application.id,
    url: /^https?:\/\//i.test(application.url) ? application.url : undefined,
  };
}

// A key fingerprint is the first 16 characters of the hex bytes of the key contents
// It does not include the key type.
export function getKeyFingerprint(key?: v2.PublicKey): string | undefined {
  if (!key) {
    return undefined;
  }
  return bytesToHex(key.key).substring(0, 16);
}

/** The payloads a `Content.contentBody` can carry, keyed by field name
 *  (`post`, `follow`, `verificationClaim`, …). */
type ContentPayloads = v2.ContentBody extends infer U
  ? U extends { inner: infer I }
    ? I
    : never
  : never;

/** Every `Content.contentBody` variant, by its field name. */
export type ContentKind = ContentPayloads extends infer I
  ? I extends Record<string, unknown>
    ? keyof I & string
    : never
  : never;

/** The payload a given content kind carries. `ContentBodyOf<'follow'>` is
 *  `v2.Follow`, `ContentBodyOf<'post'>` is `v2.Post`, and so on. */
export type ContentBodyOf<K extends ContentKind> =
  Extract<ContentPayloads, Record<K, unknown>> extends Readonly<
    Record<K, infer T>
  >
    ? T
    : never;

/** The payload of `content` if it's of `kind`. */
export function contentAs<K extends ContentKind>(
  content: v2.Content | undefined,
  kind: K,
): ContentBodyOf<K> | undefined {
  const inner = content?.contentBody?.inner as
    | Record<string, unknown>
    | undefined;
  if (!inner || !(kind in inner)) return undefined;
  return inner[kind] as ContentBodyOf<K>;
}

/** The field name of `content`'s payload (`'post'`, `'follow'`, …). */
export function contentKind(
  content: v2.Content | undefined,
): ContentKind | undefined {
  const inner = content?.contentBody?.inner as
    | Record<string, unknown>
    | undefined;
  return inner ? (Object.keys(inner)[0] as ContentKind) : undefined;
}

/** A bundle decoded against a specific content kind: the event, the
 *  content narrowed to that kind's payload type, and the bundle's signed
 *  event (validated to be present). */
export type DecodedBundle<K extends ContentKind> = {
  event: v2.Event;
  content: ContentBodyOf<K>;
  signedEvent: v2.SignedEvent;
};

/**
 * Narrow an `EventBundle` to a specific content kind. rs-core has already
 * verified and decoded it; this picks out the event and the payload.
 *
 * Returns `null` when the bundle is incomplete or carries a different kind.
 * The `kind` argument both filters and types the result: the returned
 * `content` is narrowed to that kind's payload, so `decodeBundle(b, 'follow')`
 * yields a `v2.Follow` and `decodeBundle(b, 'post')` a `v2.Post`.
 */
export function decodeBundle<K extends ContentKind>(
  bundle: v2.EventBundle,
  kind: K,
): DecodedBundle<K> | null {
  const signedEvent = bundle.signedEvent;
  const event = signedEvent?.event;
  if (!signedEvent || !event) return null;
  const content = contentAs(bundle.serializedContent?.content, kind);
  if (content === undefined) return null;
  return { event, content, signedEvent };
}

/** The event in a bundle, if any. */
export function bundleEvent(
  bundle: v2.EventBundle | undefined,
): v2.Event | undefined {
  return bundle?.signedEvent?.event;
}

/** The content in a bundle, if any. */
export function bundleContent(
  bundle: v2.EventBundle | undefined,
): v2.Content | undefined {
  return bundle?.serializedContent?.content;
}

/** The id an `EventKey` is shared as (links, the verifier): rs-core's
 *  `eventKeyId`, the hex of its serialization. */
export function eventKeyId(eventKey: v2.EventKey): string {
  return ffiEventKeyId(eventKey);
}

/** Decode a v2 EventBundle into PostData, or null if not a post. */
export function decodePostBundle(bundle: v2.EventBundle): PostData | null {
  const decoded = decodeBundle(bundle, 'post');
  if (!decoded) return null;
  try {
    const { event, content: post, signedEvent } = decoded;
    const key = event.key;
    if (!key?.signedBy?.key) return null;

    const id = eventKeyId(key);
    const reply = post.reply
      ? {
          rootId: post.reply.root ? eventKeyId(post.reply.root) : undefined,
          parentId: post.reply.parent
            ? eventKeyId(post.reply.parent)
            : undefined,
        }
      : undefined;
    const quoteId = post.quote ? eventKeyId(post.quote) : undefined;

    return {
      id,
      identity: key.identity,
      signedBy: key.signedBy,
      sequence: key.sequence.toString(),
      content: post.text,
      createdAt: Number(event.createdAt ?? 0),
      application: event.application,
      images: post.images,
      links: post.links,
      reply,
      quoteId,
      replyCount: bundle.meta?.replyCount,
      totalReactionCount: bundle.meta?.reactionCount,
      upvoteCount: bundle.meta?.upvoteCount,
      downvoteCount: bundle.meta?.downvoteCount,
      repostCount: bundle.meta?.repostCount,
      quoteCount: bundle.meta?.quoteCount,
      reactionTallies: bundle.meta?.emojiReactions,
      signedEvent,
    };
  } catch (e) {
    console.warn('[decodePostBundle] drop: decode threw', e);
    return null;
  }
}

/**
 * Convert rs-core `LabelSet`s (collected from a response's `event_hints`)
 * into a mapping from event key id to label values
 */
export function labelMapFromSets(sets: LabelSet[]): Map<string, PostLabel[]> {
  const labelMap = new Map<string, PostLabel[]>();
  for (const set of sets) {
    labelMap.set(eventKeyId(set.target), set.labels);
  }
  return labelMap;
}

/** A repost event decoded into who reposted, the target post's id, and
 *  the repost event's own id. `null` if the bundle isn't a repost. */
function decodeRepostBundle(bundle: v2.EventBundle): {
  repostedBy: string;
  targetId: string;
  repostId: string;
  repostedAt: number;
} | null {
  const decoded = decodeBundle(bundle, 'repost');
  if (!decoded) return null;
  try {
    const key = decoded.event.key;
    if (!key?.signedBy?.key) return null;
    const target = decoded.content.post;
    if (!target) return null;
    return {
      repostedBy: key.identity,
      targetId: eventKeyId(target),
      repostId: eventKeyId(key),
      repostedAt: Number(decoded.event.createdAt ?? 0),
    };
  } catch {
    return null;
  }
}

/**
 * Decode a `GetFeedResponse` into renderable posts. Plain posts decode
 * directly; reposts resolve their target post from `event_hints` (the
 * server ships the reposted post alongside) and surface it tagged with
 * `repostedBy`. A repost whose target isn't in the hints is dropped.
 */
export function decodeFeedItems(
  response: v2.GetFeedResponse,
  labelMap: Map<string, PostLabel[]>,
): PostData[] {
  // Gather posts from event hints
  const hintPosts = new Map<string, PostData>();
  for (const hint of response.eventHints) {
    if (!hint.eventBundle) continue;

    const post = decodePostBundle(hint.eventBundle);
    if (!post) continue;

    post.labels = labelMap.get(post.id);
    hintPosts.set(post.id, post);
  }

  // Gather feed items from event bundles
  const items: PostData[] = [];
  for (const bundle of response.eventBundles) {
    let post: PostData | null = decodePostBundle(bundle);

    // Decode post or repost
    if (post) {
      post.labels = labelMap.get(post.id);
    } else {
      const repost = decodeRepostBundle(bundle);
      if (!repost) continue;

      const target = hintPosts.get(repost.targetId);
      if (!target) continue;

      post = {
        ...target,
        repostedBy: repost.repostedBy,
        repostId: repost.repostId,
        repostedAt: repost.repostedAt,
      };
    }

    // Add any quoted content
    if (post.quoteId) {
      post.quotePost = hintPosts.get(post.quoteId);
    }

    items.push(post);
  }

  return items;
}

/** What a `QueryData` of kind `T` carries, e.g. `{ response, labels }`. */
export type QueryPayload<T extends QueryData_Tags> =
  Extract<QueryData, { tag: T }> extends { inner: infer I } ? I : never;

/**
 * The payload of a query result of the given kind, e.g.
 * `queryPayload(data, QueryData_Tags.Feed)` is the `GetFeedResponse`
 * with its labels. `undefined` when there's no data or it's another kind.
 */
export function queryPayload<T extends QueryData_Tags>(
  data: QueryData | undefined,
  tag: T,
): QueryPayload<T> | undefined {
  if (!data || data.tag !== tag) return undefined;
  return data.inner as unknown as QueryPayload<T>;
}

/** Get the forward cursor token from a previous feed query result */
export function extractFeedToken(
  _status: QueryStatus | undefined,
  data: QueryData | undefined,
): string | undefined {
  return queryPayload(data, QueryData_Tags.Feed)?.response.pageInfo?.endCursor;
}

/** Check whether it's reasonable to fetch more feed data from servers */
export function shouldExtend(
  hasNextPage: boolean,
  query: UseQueryResult,
): boolean {
  return hasNextPage && query.successfulServers > 0;
}

/**
 * Dicebear identicon URL for a public key.
 */
export function identiconUrl(seed: string, size = 80): string {
  return `https://api.dicebear.com/7.x/identicon/png?seed=${seed}&size=${size}`;
}

/**
 * Pick the smallest image variant at or above `targetSize`. Falls back
 * to the largest available variant if none are big enough. Returns
 * `null` when the set is empty.
 */
export function pickImageVariant(
  imageSet: v2.ImageSet | null | undefined,
  targetSize: number,
): v2.Image | null {
  if (!imageSet || imageSet.images.length === 0) return null;
  const sorted = [...imageSet.images].sort((a, b) => a.width - b.width);
  return (
    sorted.find((img) => img.width >= targetSize) ??
    sorted[sorted.length - 1] ??
    null
  );
}

export function bytesToHex(bytes: Bytes): string {
  return Array.from(asBytes(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Id of the event key for a bundle — matches `PostData.id` encoding.
 *  Returns `null` if the bundle has no event. */
export function bundleEventId(bundle: v2.EventBundle): string | null {
  const key = bundle.signedEvent?.event?.key;
  return key ? eventKeyId(key) : null;
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function publicKeyToString(key: v2.PublicKey): string {
  const keyType = Number(key.keyType ?? 0);
  return `${keyType}_${bytesToHex(key.key ?? new ArrayBuffer(0))}`;
}

export function stringToPublicKey(str: string): v2.PublicKey {
  const idx = str.indexOf('_');
  const keyTypeStr = str.slice(0, idx);
  const keyHex = str.slice(idx + 1);
  return {
    keyType: Number(keyTypeStr) as v2.KeyType,
    key: asBuffer(hexToBytes(keyHex)),
  };
}

export function publicKeyToStringURLSafe(key: v2.PublicKey): string {
  return publicKeyToString(key);
}

export function stringURLSafeToPublicKey(str: string): v2.PublicKey {
  return stringToPublicKey(str);
}

/** Whether two public keys are the same key. */
export function keysEqual(a: v2.PublicKey, b: v2.PublicKey): boolean {
  return a.keyType === b.keyType && bytesToHex(a.key) === bytesToHex(b.key);
}

/**
 * @deprecated misnamed — this returns a short base64 form of the signer's
 * public key, not the identity id. Use {@link shortenIdentityId} or render
 * the v2 `key.identity` string directly.
 */
export function getIdentityId(publicKey: v2.PublicKey): string {
  const bytes = asBytes(publicKey.key ?? new ArrayBuffer(0));
  if (bytes.length === 0) return '...';
  return toBase64(bytes).slice(0, 10);
}

export function getIdentityIdShort(publicKey: v2.PublicKey): string {
  return getIdentityId(publicKey).slice(0, 4);
}

/**
 * Short display form of a v2 identity id (hex sha256 of the initial
 * Identity content). Returns a placeholder if the id is empty.
 */
export function shortenIdentityId(
  identity: string | undefined,
  len = 10,
): string {
  if (!identity) return '...';
  return identity.slice(0, len);
}
