import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import {
  decodeBundle,
  type PostData,
} from '@/src/common/lib/polycentric-hooks/helpers';
import { useQuery, type QueryKey } from '@/src/common/query/hooks/useQuery';
import {
  COLLECTION,
  Query,
  v2,
  type EventKey,
} from '@polycentric/react-native';
import { useMemo } from 'react';
import useReactions from './useReactions';

/** The identities that reacted to a post with a particular emoji. */
export type ReactionGroup = {
  emoji: string;
  identities: string[];
};

/** Placeholder query key when we don't have a post to query for yet. */
const DUMMY_EVENT_KEY: EventKey = {
  collection: COLLECTION.FEED,
  identity: '',
  signedBy: { keyType: 0, key: new ArrayBuffer(0) },
  sequence: 0n,
};

/** Stable references returned for posts with no reactions to display. */
const EMPTY_GROUPS: ReactionGroup[] = [];
const EMPTY_REACTORS: Map<string, string[]> = new Map();

/**
 * Query cache key for the reactions of a single post.
 */
export function postReactionsQueryKey(
  postId: string,
  limit?: number,
): QueryKey {
  return ['get_reactions', postId, limit !== undefined ? String(limit) : ''];
}

/**
 * Decode a `GetReactionsResponse` into a mapping of emoji to identities that
 * reacted with that emoji.
 */
function decodeResponse(data: ArrayBuffer | undefined): Map<string, string[]> {
  if (!data) return EMPTY_REACTORS;

  let response: v2.GetReactionsResponse;
  try {
    response = v2.GetReactionsResponse.fromBinary(new Uint8Array(data));
  } catch {
    return EMPTY_REACTORS;
  }

  // Collect the reaction events as a map from emoji to list of identities
  const reactions = new Map<string, string[]>();
  for (const bundle of response.eventBundles) {
    const decoded = decodeBundle(bundle, 'reaction');
    if (!decoded) continue;

    const emoji = decoded.content.emoji;
    if (!emoji || !decoded.content.positive) continue;

    const identity = decoded.event.key?.identity;
    if (!identity) continue;

    const identities = reactions.get(emoji);
    if (identities) identities.push(identity);
    else reactions.set(emoji, [identity]);
  }

  return reactions;
}

/**
 * Prepare the reaction data for consumption, overlaying the user's reaction
 * if it is not present.
 */
function view(
  reactions: Map<string, string[]>,
  identity: string | undefined,
  myEmoji: string | undefined,
): ReactionGroup[] {
  // Ensure that the user's reaction matches our local state
  if (identity !== undefined) {
    const overlayedReactions = new Map<string, string[]>();
    for (const [emoji, identities] of reactions) {
      // Remove any reaction from the user's identity
      const others = identities.filter((id) => id !== identity);
      if (others.length > 0) overlayedReactions.set(emoji, others);
    }

    if (myEmoji !== undefined) {
      const existing = overlayedReactions.get(myEmoji);
      if (existing) existing.push(identity);
      else overlayedReactions.set(myEmoji, [identity]);
    }

    reactions = overlayedReactions;
  }

  if (reactions.size === 0) return EMPTY_GROUPS;

  const groups: ReactionGroup[] = [];

  for (const [emoji, identities] of reactions) {
    groups.push({ emoji, identities });
  }

  groups.sort((a, b) => {
    if (a.identities.length !== b.identities.length) {
      return b.identities.length - a.identities.length;
    }

    return a.emoji < b.emoji ? -1 : 1;
  });

  return groups;
}

/**
 * Get the reactions to a post (with the user's reaction overlayed if necessary).
 */
export function usePostReactions(
  post: PostData | undefined,
  options?: { limit?: number },
): ReactionGroup[] {
  const client = usePolycentric();

  const eventKey: EventKey = useMemo(() => {
    if (!post) return DUMMY_EVENT_KEY;

    return {
      collection: COLLECTION.FEED,
      identity: post.identity,
      signedBy: {
        keyType: post.signedBy.keyType,
        key: post.signedBy.key.slice().buffer as ArrayBuffer,
      },
      sequence: BigInt(post.sequence),
    };
  }, [post]);

  const limit = options?.limit;

  const query = useQuery(
    postReactionsQueryKey(post?.id ?? '', limit),
    new Query.GetReactions({ target: eventKey, limit }),
    undefined,
    !!post,
  );

  const myReaction = useReactions((s) =>
    post ? s.reactions.get(post.id) : undefined,
  );

  const reactions = useMemo(() => decodeResponse(query.data), [query.data]);

  const myIdentity = client.activeIdentityKey ?? undefined;
  const myEmoji =
    myIdentity !== undefined && myReaction?.positive && myReaction.emoji
      ? myReaction.emoji
      : undefined;

  return useMemo(
    () => view(reactions, myIdentity, myEmoji),
    [reactions, myIdentity, myEmoji],
  );
}

export default usePostReactions;
