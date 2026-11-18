import type { PostData } from '@/src/common/lib/polycentric-hooks';
import type { ReactionGroup } from './usePostReactions';

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

/** One emoji line of the reactions summary. */
export type ReactionSummaryLine = {
  emoji: string;
  /** Whether the user reacted with `emoji`. */
  includesMe: boolean;
  /** The most recent other reactor with `emoji`, if fetched. */
  identity?: string;
  /** Reactions with `emoji` beyond the user's and `identity`. */
  othersCount: number;
};

/**
 * Condense the reactions to a post into one line per emoji, naming the user
 * and the most recent other reactor.
 *
 * Lines follow the order of `groups` (most recent reaction first, the user's
 * own first), then emojis that only have a tally, in tally order.
 */
export function summarizeReactions(
  groups: Map<string, ReactionGroup>,
  counts: ReactionCount[],
  myIdentity: string | undefined,
  maxLines: number,
): { lines: ReactionSummaryLine[]; moreCount: number } {
  const countByEmoji = new Map(counts.map((c) => [c.emoji, c.count]));

  const allLines: ReactionSummaryLine[] = [];
  for (const group of groups.values()) {
    const includesMe = group.reactions.some(
      (reaction) => reaction.identity === myIdentity,
    );
    const identity = group.reactions.find(
      (reaction) => reaction.identity !== myIdentity,
    )?.identity;
    // The tally can lag behind the fetched reactions.
    const total = Math.max(
      countByEmoji.get(group.emoji) ?? 0,
      group.reactions.length,
    );
    allLines.push({
      emoji: group.emoji,
      includesMe,
      identity,
      othersCount: total - Number(includesMe) - Number(identity !== undefined),
    });
  }
  for (const { emoji, count } of counts) {
    if (groups.has(emoji)) continue;
    allLines.push({ emoji, includesMe: false, othersCount: count });
  }

  return {
    lines: allLines.slice(0, maxLines),
    moreCount: Math.max(allLines.length - maxLines, 0),
  };
}
