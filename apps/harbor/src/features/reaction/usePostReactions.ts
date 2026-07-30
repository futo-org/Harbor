import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import {
  decodeBundle,
  eventKeyId,
  type PostData,
} from '@/src/common/lib/polycentric-hooks/helpers';
import {
  RefreshStrategy,
  useQuery,
  type QueryKey,
} from '@/src/common/query/hooks/useQuery';
import {
  COLLECTION,
  Query,
  v2,
  type EventKey,
} from '@polycentric/react-native';
import { useMemo } from 'react';
import useReactions from './useReactions';

/** Info for a single reaction event */
export type ReactionInfo = {
  identity: string;
  emoji: string;
};

/** Reaction info from the reaction events for a particular emoji. */
export type ReactionGroup = {
  emoji: string;
  reactions: ReactionInfo[];
};

/** Reaction data extracted from the query response data. */
export type PostReactions = {
  groups: Map<string, ReactionGroup>;
  all: ReactionInfo[];
};

/** Reaction data + query fields */
export type PostReactionsResult = PostReactions & {
  isLoading: boolean;
  refresh: () => void;
};

/** Placeholder query key when we don't have a post to query for yet. */
const DUMMY_EVENT_KEY: EventKey = {
  collection: COLLECTION.FEED,
  identity: '',
  signedBy: { keyType: 0, key: new ArrayBuffer(0) },
  sequence: 0n,
};

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
 * Decode a `GetReactionsResponse` value and extract the reactions targeting `postId`.
 */
function decodeResponse(
  data: ArrayBuffer | undefined,
  postId: string | undefined,
): ReactionInfo[] {
  if (!data || !postId) return [];

  let response: v2.GetReactionsResponse;
  try {
    response = v2.GetReactionsResponse.fromBinary(new Uint8Array(data));
  } catch {
    return [];
  }

  const reactions: ReactionInfo[] = [];

  for (const bundle of response.eventBundles) {
    const decoded = decodeBundle(bundle, 'reaction');
    if (!decoded) continue;

    const targetKey = decoded.content.eventKey;
    if (!targetKey || eventKeyId(targetKey) !== postId) continue;

    const emoji = decoded.content.emoji;
    if (!emoji || !decoded.content.positive) continue;

    const identity = decoded.event.key?.identity;
    if (!identity) continue;

    reactions.push({ emoji, identity });
  }

  return reactions;
}

/**
 * Prepare the reaction data for consumption, ensuring that if the user has a
 * reaction, then it appears at the beginning.
 */
function view(
  reactions: ReactionInfo[],
  identity: string | undefined,
  myEmoji: string | undefined,
): PostReactions {
  const groups = new Map<string, ReactionGroup>();
  const all: ReactionInfo[] = [];

  // Ensure that the user's emoji is at the front everywhere that it appears
  if (myEmoji && identity) {
    const reaction = { identity, emoji: myEmoji };
    all.push(reaction);
    groups.set(myEmoji, { emoji: myEmoji, reactions: [reaction] });
  }

  for (const reaction of reactions) {
    // We have already included the user's reaction
    if (reaction.identity === identity) continue;

    all.push(reaction);

    const group = groups.get(reaction.emoji);
    if (group) {
      group.reactions.push(reaction);
    } else {
      groups.set(reaction.emoji, {
        emoji: reaction.emoji,
        reactions: [reaction],
      });
    }
  }

  return { groups, all };
}

/**
 * Get the reactions to a post (with the user's reaction overlayed if necessary).
 */
export function usePostReactions(
  post: PostData | undefined,
  options?: { limit?: number },
): PostReactionsResult {
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

  const reactions = useMemo(
    () => decodeResponse(query.data, post?.id),
    [query.data, post?.id],
  );

  const myIdentity = client.activeIdentityKey ?? undefined;
  const myEmoji =
    myIdentity !== undefined && myReaction?.positive && myReaction.emoji
      ? myReaction.emoji
      : undefined;

  const reactionsView = useMemo(
    () => view(reactions, myIdentity, myEmoji),
    [reactions, myIdentity, myEmoji],
  );

  return {
    isLoading: query.isLoading,
    refresh: () => query.refresh(RefreshStrategy.Lazy),
    ...reactionsView,
  };
}

export default usePostReactions;
