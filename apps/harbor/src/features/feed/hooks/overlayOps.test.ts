import type { PostData, PostLabel } from '@/src/common/lib/polycentric-hooks';
import {
  labelsChanged,
  mergeLabels,
  postChanged,
  updatePostEntry,
} from './overlayOps';

const VIOLENCE: PostLabel = { value: 'violence', labeledBy: 'moderatorA' };
const NUDITY: PostLabel = { value: 'nudity', labeledBy: 'moderatorA' };

/** A post as one server delivered it. Only the fields `postChanged` reads. */
function post(overrides: Partial<PostData> = {}): PostData {
  return {
    id: 'post-1',
    content: 'hello',
    createdAt: 1,
    replyCount: 2,
    totalReactionCount: 3,
    upvoteCount: 3,
    downvoteCount: 0,
    reactionTallies: [],
    ...overrides,
  } as PostData;
}

describe('labelsChanged', () => {
  it('treats absent and empty as the same', () => {
    expect(labelsChanged(undefined, [])).toBe(false);
  });

  it('ignores order', () => {
    expect(labelsChanged([VIOLENCE, NUDITY], [NUDITY, VIOLENCE])).toBe(false);
  });

  it('detects an added label', () => {
    expect(labelsChanged([VIOLENCE], [VIOLENCE, NUDITY])).toBe(true);
  });

  it('detects the same value from a different labeller', () => {
    expect(
      labelsChanged([VIOLENCE], [{ ...VIOLENCE, labeledBy: 'moderatorB' }]),
    ).toBe(true);
  });
});

describe('mergeLabels', () => {
  it('unions both sides, deduplicated', () => {
    expect(mergeLabels([VIOLENCE], [VIOLENCE, NUDITY])).toEqual([
      VIOLENCE,
      NUDITY,
    ]);
  });

  it('keeps existing labels when the new copy has none', () => {
    expect(mergeLabels([VIOLENCE], undefined)).toEqual([VIOLENCE]);
  });
});

describe('postChanged', () => {
  it('is true when the labels differ', () => {
    expect(postChanged(post(), post({ labels: [VIOLENCE] }))).toBe(true);
  });

  it('is false when nothing differs', () => {
    expect(
      postChanged(post({ labels: [VIOLENCE] }), post({ labels: [VIOLENCE] })),
    ).toBe(false);
  });
});

describe('updatePostEntry', () => {
  it('applies a label that arrives after the post was cached', () => {
    const cached = updatePostEntry(undefined, post());
    const updated = updatePostEntry(cached, post({ labels: [VIOLENCE] }));
    expect(updated.post.labels).toEqual([VIOLENCE]);
  });

  it('keeps a label when a later copy of the post lacks it', () => {
    const cached = updatePostEntry(undefined, post({ labels: [VIOLENCE] }));
    const updated = updatePostEntry(cached, post({ replyCount: 9 }));
    expect(updated.post.labels).toEqual([VIOLENCE]);
    expect(updated.post.replyCount).toBe(9);
  });

  it('unions labels from two servers', () => {
    const fromA = updatePostEntry(undefined, post({ labels: [VIOLENCE] }));
    const fromB = updatePostEntry(fromA, post({ labels: [NUDITY] }));
    expect(fromB.post.labels).toEqual([VIOLENCE, NUDITY]);
  });

  it('keeps a stable reference when nothing changed', () => {
    const cached = updatePostEntry(undefined, post({ labels: [VIOLENCE] }));
    const updated = updatePostEntry(cached, post({ labels: [VIOLENCE] }));
    expect(updated.post).toBe(cached.post);
  });
});
