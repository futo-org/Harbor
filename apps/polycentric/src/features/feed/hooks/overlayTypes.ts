import type { PostData } from '@/src/common/lib/polycentric-hooks';

/**
 * Stores the overlay for one counter.
 * Use this when we have a local changes that may take time to be present in
 * server responses.
 * We store a local offset from the server's value and only discard it once
 * the server's value equals or exceeds our believed value.
 * If remote changes happen concurrently with our overlay, it is possible that
 * we never discard the overlay (but this is probably an acceptable outcome).
 * This type is immutable so that updating overlay state can be a pure function.
 */
export class CounterOverlay {
  /** Latest server value that we know of */
  readonly original: number;

  /** Our offset from `original` */
  readonly localOffset: number;

  constructor(count: number, offset: number) {
    this.original = count;
    this.localOffset = offset;
  }

  /** Resolve the local value of the counter */
  get(): number {
    return this.original + this.localOffset;
  }

  /**
   * Change the local offset based on `count`.
   * If `isShift` is false, make the local value of the counter resolve to `count`.
   * If `isShift` is true, `count` is instead added to the current local offset.
   * Returns `undefined` iff the new overlay would have a offset of 0.
   */
  localUpdate(
    count: number | undefined,
    isShift = false,
  ): CounterOverlay | undefined {
    if (count === undefined) return this;

    const newOffset = isShift
      ? this.localOffset + count
      : count - this.original;

    if (newOffset === 0) return undefined;

    return new CounterOverlay(this.original, newOffset);
  }

  /**
   * Acknowledge a new server value of `count` and update our local state.
   * Returns `undefined` iff we should discard the overlay and take the server's
   * data.
   */
  remoteUpdate(count: number | undefined): CounterOverlay | undefined {
    if (count === undefined) return this;
    const newOffset = this.get() - count;

    // Check whether the server has reached or exceeded our offset
    if (newOffset * this.localOffset <= 0) {
      return undefined;
    }

    return new CounterOverlay(count, newOffset);
  }
}

/**
 * Build a counter overlay for a local change, ensuring a non-negative count
 * and returning `undefined` when we can.
 */
function reactionCounter(
  current: number,
  localOffset: number,
): CounterOverlay | undefined {
  const target = Math.max(0, current + localOffset);
  if (target === current) return undefined;
  return new CounterOverlay(current, target - current);
}

export type Reaction = { emoji: string | undefined; positive: boolean };

export function reactionsEqual(
  a: Reaction | undefined,
  b: Reaction | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.emoji === b.emoji && a.positive === b.positive;
}

/**
 * Extract the count for a reaction in a post.
 * Returns 0 when the count is not found.
 * Returns undefined when there is no reaction or it carries no emoji.
 */
function postTallyCount(
  post: PostData,
  reaction: Reaction | undefined,
): number | undefined {
  if (reaction?.emoji === undefined) return undefined;

  const tally = post.reactionTallies?.find(
    (t) => t.emoji === reaction.emoji && t.positive === reaction.positive,
  );

  return tally?.count ?? 0;
}

/** Net change to each summary counter with this reaction overlay state. */
function reactionOffsets(
  prev: Reaction | undefined,
  next: Reaction | undefined,
): { total: number; upvote: number; downvote: number } {
  return {
    total: (next ? 1 : 0) - (prev ? 1 : 0),
    upvote: (next?.positive ? 1 : 0) - (prev?.positive ? 1 : 0),
    downvote:
      (next && !next.positive ? 1 : 0) - (prev && !prev.positive ? 1 : 0),
  };
}

/**
 * Create the tally counter overlay for `reaction`, with the count shifted by `change`.
 */
function tallyOverlay(
  post: PostData,
  reaction: Reaction | undefined,
  shouldOverlayTallies: boolean,
  change: number,
): CounterOverlay | undefined {
  if (!shouldOverlayTallies || reaction?.emoji === undefined) return undefined;
  return reactionCounter(postTallyCount(post, reaction) ?? 0, change);
}

/**
 * Overlay for the user's local reaction change on a post.
 *
 * It should cover three cases:
 * (1) the user adds a reaction
 * (2) the user deletes their reaction
 * (3) the user changes their reaction (delete + add)
 *
 * We want to have the overlay apply to the summary counters as well as the tally.
 * We also want the overlay to be discarded once the server has caught up.
 * However, we may not get all of the counters in every server response.
 * We will selectively mark counters `undefined` as we go and discard the
 * whole overlay once they are all undefined.
 *
 * This type is immutable so that updating overlay state can be a pure function.
 */
export class ReactionOverlay {
  private constructor(
    /** The reaction being removed, or `undefined` if none. */
    readonly previous: Reaction | undefined,
    readonly previousTally: CounterOverlay | undefined,
    /** The reaction being added, or `undefined` if none. */
    readonly next: Reaction | undefined,
    readonly nextTally: CounterOverlay | undefined,
    // Net reaction summary counters shared by both reactions:
    readonly totalReactionCount: CounterOverlay | undefined,
    readonly upvoteCount: CounterOverlay | undefined,
    readonly downvoteCount: CounterOverlay | undefined,
  ) {}

  /**
   * Create an overlay for the user's new reaction state.
   * To seamlessly handle additions, swaps, and changes, we track the previous
   * and new reaction.
   * For feeds that don't receive tallies, we should keep the overlay undefined
   * from the beginning.
   */
  static create(
    previous: Reaction | undefined,
    next: Reaction | undefined,
    post: PostData,
    shouldOverlayTallies: boolean,
  ): ReactionOverlay | undefined {
    if (reactionsEqual(previous, next)) return undefined;

    const offsets = reactionOffsets(previous, next);

    const total = reactionCounter(post.totalReactionCount ?? 0, offsets.total);
    const upvote = reactionCounter(post.upvoteCount ?? 0, offsets.upvote);
    const downvote = reactionCounter(post.downvoteCount ?? 0, offsets.downvote);

    const previousTally = tallyOverlay(
      post,
      previous,
      shouldOverlayTallies,
      -1,
    );

    const nextTally = tallyOverlay(post, next, shouldOverlayTallies, 1);

    return ReactionOverlay.assemble(
      previous,
      previousTally,
      next,
      nextTally,
      total,
      upvote,
      downvote,
    );
  }

  /**
   * Build an overlay from precomputed counters.
   * Returns undefined iff all of the counters are undefined.
   */
  private static assemble(
    previous: Reaction | undefined,
    previousTally: CounterOverlay | undefined,
    next: Reaction | undefined,
    nextTally: CounterOverlay | undefined,
    total: CounterOverlay | undefined,
    upvote: CounterOverlay | undefined,
    downvote: CounterOverlay | undefined,
  ): ReactionOverlay | undefined {
    if (!(total || upvote || downvote || previousTally || nextTally)) {
      return undefined;
    }

    return new ReactionOverlay(
      previous,
      previousTally,
      next,
      nextTally,
      total,
      upvote,
      downvote,
    );
  }

  /**
   * Return a new overlay based on the client's requested `prev` and `next` and
   * the current one.
   */
  localUpdate(
    prev: Reaction | undefined,
    next: Reaction | undefined,
    post: PostData,
    shouldOverlayTallies: boolean,
  ): ReactionOverlay | undefined {
    const offsets = reactionOffsets(prev, next);

    const total = this.summaryUpdate(
      this.totalReactionCount,
      post.totalReactionCount,
      offsets.total,
    );

    const upvoteCount = this.summaryUpdate(
      this.upvoteCount,
      post.upvoteCount,
      offsets.upvote,
    );

    const downvoteCount = this.summaryUpdate(
      this.downvoteCount,
      post.downvoteCount,
      offsets.downvote,
    );

    // Keep `prev` the same if the caller's request is to delete the reaction
    // that our current overlay is adding.
    const previous = reactionsEqual(prev, this.next) ? this.previous : prev;

    // Remove the tally overlay if we now add and remove the same reaction
    const cancel = reactionsEqual(previous, next);
    const resolvedPrevious = cancel ? undefined : previous;
    const resolvedNext = cancel ? undefined : next;

    const previousTally = tallyOverlay(
      post,
      resolvedPrevious,
      shouldOverlayTallies,
      -1,
    );

    const nextTally = tallyOverlay(post, resolvedNext, shouldOverlayTallies, 1);

    return ReactionOverlay.assemble(
      resolvedPrevious,
      previousTally,
      resolvedNext,
      nextTally,
      total,
      upvoteCount,
      downvoteCount,
    );
  }

  /**
   * Update a reaction summary counter based on the current value and
   * requested update.
   */
  private summaryUpdate(
    existing: CounterOverlay | undefined,
    postValue: number | undefined,
    amount: number,
  ): CounterOverlay | undefined {
    if (existing) {
      // Keep the counter non-negative
      const capped = Math.max(amount, -existing.get());
      return existing.localUpdate(capped, true);
    }
    if (postValue === undefined) return undefined;
    return reactionCounter(postValue, amount);
  }

  /**
   * Acknowledge the latest server data and update every counter.
   * Once every counter is undefined, we discard the whole overlay and return
   * undefined here as well.
   */
  remoteUpdate(latest: PostData): ReactionOverlay | undefined {
    const total = this.totalReactionCount?.remoteUpdate(
      latest.totalReactionCount,
    );
    const upvote = this.upvoteCount?.remoteUpdate(latest.upvoteCount);
    const downvote = this.downvoteCount?.remoteUpdate(latest.downvoteCount);

    const previousTally = this.previousTally?.remoteUpdate(
      postTallyCount(latest, this.previous),
    );
    const nextTally = this.nextTally?.remoteUpdate(
      postTallyCount(latest, this.next),
    );

    return ReactionOverlay.assemble(
      this.previous,
      previousTally,
      this.next,
      nextTally,
      total,
      upvote,
      downvote,
    );
  }
}

/**
 * Stores the overlay for a `PostData` object.
 * This accounts for local state that a server may not have taken into account
 * when it sends a post to us.
 */
export type PostOverlay = {
  replyCount: CounterOverlay | undefined;
  reaction: ReactionOverlay | undefined;
};

export const EMPTY_POST_OVERLAY: PostOverlay = Object.freeze({
  replyCount: undefined,
  reaction: undefined,
} as PostOverlay);

/**
 * Store a canonical `PostData` object for a post with the overlay applied,
 * along with the overlay that was used.
 * This object and its fields should be treated as immutable.
 */
export type PostEntry = {
  /**
   * Latest `PostData` for this post but without the overlay applied.
   */
  originalPost: PostData;

  /**
   * Latest `PostData` for this post with the overlay applied.
   */
  post: PostData;

  /** Local client overlay for this post. */
  overlay: PostOverlay | undefined;
};
