import type { PostData } from '@/src/common/lib/polycentric-hooks';

/**
 * Information needed to display a post reaction to the user.
 */
export type DisplayReaction = {
  emoji: string;
  count: number;
  mine: boolean;
};

/** Stable reference returned when a post has no reactions to display. */
const EMPTY_DISPLAY_REACTIONS: DisplayReaction[] = [];

/**
 * Derive the reactions to display for a post.
 */
export function deriveDisplayReactions(
  post: PostData,
  myReaction: { emoji: string; positive: boolean } | undefined,
): DisplayReaction[] {
  const result = (post.reactionTallies ?? [])
    .filter((t) => t.positive)
    .map((t) => ({
      emoji: t.emoji,
      count: t.count,
      mine:
        myReaction?.emoji === t.emoji && myReaction?.positive === t.positive,
    }));

  return result.length > 0 ? result : EMPTY_DISPLAY_REACTIONS;
}
