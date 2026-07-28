import type { PostData } from '@/src/common/lib/polycentric-hooks';
import {
  type CounterOverlay,
  EMPTY_POST_OVERLAY,
  type PostEntry,
  type PostOverlay,
  type Reaction,
} from './overlayTypes';
import type { v2 } from '@polycentric/react-native';

/** Apply the patch to the overlay or return `undefined` if all of the overlays are undefined now. */
export function patchPostOverlay(
  orig: PostOverlay | undefined,
  patch: Partial<PostOverlay>,
): PostOverlay | undefined {
  const overlay: PostOverlay = {
    ...(orig ?? EMPTY_POST_OVERLAY),
    ...patch,
  };

  if (overlay.replyCount) return overlay;
  if (overlay.reaction) return overlay;
  return undefined;
}

/** Get the new post overlay, if any, after taking the latest data into account. */
export function updatePostOverlay(
  orig: PostOverlay | undefined,
  latest: PostData,
): PostOverlay | undefined {
  const replyCount = orig?.replyCount?.remoteUpdate(latest.replyCount);
  const reaction = orig?.reaction?.remoteUpdate(latest);
  return patchPostOverlay(orig, { replyCount, reaction });
}

/**
 * Mutate `post` to have `overlay` applied.
 * Should never be used on a `PostData` object that is already referenced by
 * the store.
 */
export function applyPostOverlay(post: PostData, overlay?: PostOverlay) {
  const replyCount = overlay?.replyCount?.get();
  if (replyCount !== undefined) {
    post.replyCount = replyCount;
  }

  const reaction = overlay?.reaction;
  if (reaction) {
    const totalReactionCount = reaction.totalReactionCount?.get();
    if (totalReactionCount !== undefined) {
      post.totalReactionCount = totalReactionCount;
    }

    const upvoteCount = reaction.upvoteCount?.get();
    if (upvoteCount !== undefined) {
      post.upvoteCount = upvoteCount;
    }

    const downvoteCount = reaction.downvoteCount?.get();
    if (downvoteCount !== undefined) {
      post.downvoteCount = downvoteCount;
    }

    applyTallyOverlay(post, reaction.previous, reaction.previousTally);
    applyTallyOverlay(post, reaction.next, reaction.nextTally);
  }
}

/**
 * Helper needed to match rs-core's string sorting behavior.
 */
function compareCodePoints(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a.charCodeAt(i) !== b.charCodeAt(i)) {
      return (a.codePointAt(i) ?? 0) - (b.codePointAt(i) ?? 0);
    }
  }
  return a.length - b.length;
}

/**
 * Alter the reaction count for a specific reaction.
 */
export function applyTallyOverlay(
  post: PostData,
  reaction: Reaction | undefined,
  counter: CounterOverlay | undefined,
): void {
  const count = counter?.get();
  if (count === undefined || reaction?.emoji === undefined) return;

  const { emoji, positive } = reaction;

  // Drop any existing entry for this reaction
  const others = (post.reactionTallies ?? []).filter(
    (t) => !(t.emoji === emoji && t.positive === positive),
  );

  // Insert new count
  const next = count > 0 ? [...others, { emoji, positive, count }] : others;

  // Sort in the same order as rs-core
  next.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    if (a.emoji !== b.emoji) return -compareCodePoints(a.emoji, b.emoji);
    return Number(b.positive) - Number(a.positive);
  });

  post.reactionTallies = next;
}

/**
 * Check whether two reaction tally arrays are different.
 * We assume they are sorted deterministically.
 */
export function talliesChanged(
  a: v2.ReactionTally[] | undefined,
  b: v2.ReactionTally[] | undefined,
): boolean {
  if (a === b) return false;
  if (a === undefined || b === undefined) return true;
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].emoji !== b[i].emoji ||
      a[i].positive !== b[i].positive ||
      a[i].count !== b[i].count
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Assume that `orig` and `updated` have the same post id and check whether any
 * metadata has changed.
 */
export function postChanged(orig: PostData, updated: PostData): boolean {
  if (orig.replyCount !== updated.replyCount) return true;
  if (orig.totalReactionCount !== updated.totalReactionCount) return true;
  if (orig.upvoteCount !== updated.upvoteCount) return true;
  if (orig.downvoteCount !== updated.downvoteCount) return true;
  if (talliesChanged(orig.reactionTallies, updated.reactionTallies))
    return true;

  return false;
}

/**
 * Update `orig` using `latest`.
 * `latest` may be stored in the returned entry, so do not mutate it.
 * References are kept stable when the post's data hasn't changed.
 */
export function updatePostEntry(
  orig: PostEntry | undefined,
  latest: PostData,
): PostEntry {
  const originalPost =
    orig && !postChanged(orig.originalPost, latest)
      ? orig.originalPost
      : latest;

  const overlay = updatePostOverlay(orig?.overlay, latest);

  let newPost = originalPost;
  if (overlay) {
    newPost = { ...originalPost };
    applyPostOverlay(newPost, overlay);
  }

  const post = orig && !postChanged(orig.post, newPost) ? orig.post : newPost;

  return { originalPost, post, overlay };
}
