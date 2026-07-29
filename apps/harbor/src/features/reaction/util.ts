import type { PostData } from '@/src/common/lib/polycentric-hooks';

/**
 * Information extracted from one reaction tally received from the server.
 */
export type ReactionCount = {
  emoji: string;
  count: number;
};

/**
 * Filter reaction tallies to only contain the information that we would want
 * to display.
 */
export function countReactionsFrom(post: PostData): ReactionCount[] {
  if (!post.reactionTallies) return [];

  const filtered: ReactionCount[] = [];

  for (const tally of post.reactionTallies) {
    if (!tally.positive) continue;
    filtered.push({ emoji: tally.emoji, count: tally.count });
  }

  return filtered;
}

/**
 * Gather the emoji reactions to display in the preview.
 * Return up to `limit` of the most popular reactions if `myReaction` is undefined.
 * If `myReaction` is defined, then we will ensure it is not included in the
 * returned list and return only up to `limit - 1` items.
 */
export function previewOtherReactions(
  post: PostData,
  myReaction: string | undefined,
  limit: number,
): string[] {
  const output: string[] = [];
  if (!post.reactionTallies) return output;

  if (myReaction && limit > 0) limit--;

  for (const tally of post.reactionTallies) {
    if (output.length === limit) return output;
    if (!tally.positive) continue;
    if (tally.emoji === myReaction) continue;

    output.push(tally.emoji);
  }

  return output;
}
