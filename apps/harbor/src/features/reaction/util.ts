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
 * Lines match the post's reaction preview: the user's emoji first, then the
 * tallies (most popular first), then fetched emojis the tally hasn't caught up
 * with yet.
 */
export function summarizeReactions(
  groups: Map<string, ReactionGroup>,
  counts: ReactionCount[],
  myIdentity: string | undefined,
  maxLines: number,
): {
  lines: ReactionSummaryLine[];
  /** People who reacted with the emojis of the lines past `maxLines`. */
  morePeopleCount: number;
} {
  const countByEmoji = new Map(counts.map((c) => [c.emoji, c.count]));

  const myEmoji = [...groups.values()].find((group) =>
    group.reactions.some((reaction) => reaction.identity === myIdentity),
  )?.emoji;
  // A set keeps the first position of each emoji.
  const orderedEmojis = new Set<string>();
  if (myEmoji) orderedEmojis.add(myEmoji);
  for (const { emoji } of counts) orderedEmojis.add(emoji);
  for (const emoji of groups.keys()) orderedEmojis.add(emoji);

  const allLines: ReactionSummaryLine[] = [];
  for (const emoji of orderedEmojis) {
    const reactions = groups.get(emoji)?.reactions ?? [];
    const includesMe = emoji === myEmoji;
    const identity = reactions.find(
      (reaction) => reaction.identity !== myIdentity,
    )?.identity;
    // The tally can lag behind the fetched reactions.
    const total = Math.max(countByEmoji.get(emoji) ?? 0, reactions.length);
    allLines.push({
      emoji,
      includesMe,
      identity,
      othersCount: total - Number(includesMe) - Number(identity !== undefined),
    });
  }

  const moreLines = allLines.slice(maxLines);
  return {
    lines: allLines.slice(0, maxLines),
    morePeopleCount: moreLines.reduce(
      (sum, line) =>
        sum +
        line.othersCount +
        Number(line.includesMe) +
        Number(line.identity !== undefined),
      0,
    ),
  };
}
