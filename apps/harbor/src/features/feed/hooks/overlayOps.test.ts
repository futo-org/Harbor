import type { PostData, PostLabel } from '@/src/common/lib/polycentric-hooks';
import type { v2 } from '@polycentric/react-native';

// `labelsChanged` is an `rs-core` call, and jest can't load the native module.
// Mock `labels_changed` with the same characteristics: order-insensitive,
// comparing (value, labeledBy).
jest.mock('@polycentric/react-native', () => ({
  labelsChanged: (a: PostLabel[], b: PostLabel[]) =>
    a.length !== b.length ||
    b.some(
      (label) =>
        !a.some(
          (other) =>
            other.value === label.value && other.labeledBy === label.labeledBy,
        ),
    ),
}));

import { labelsetChanged, postChanged, updatePostEntry } from './overlayOps';

const MODERATOR = 'moderatoridentity';
const OTHER_MODERATOR = 'othermoderatoridentity';

function label(value: string, labeledBy = MODERATOR): PostLabel {
  return { value, labeledBy };
}

/** A post carrying `labels`, otherwise identical between calls. */
function post(labels?: PostLabel[]): PostData {
  return {
    id: 'abcd',
    identity: 'authoridentity',
    signedBy: {} as v2.PublicKey,
    sequence: '5',
    content: 'hello',
    createdAt: 1,
    images: [],
    links: [],
    replyCount: 2,
    signedEvent: {} as v2.SignedEvent,
    labels,
  } as PostData;
}

describe('postChanged', () => {
  it('is true when only the label set differs', () => {
    expect(
      postChanged(
        post([label('self-harm')]),
        post([label('self-harm'), label('spam')]),
      ),
    ).toBe(true);
  });

  it('is false when the label set only differs in order', () => {
    expect(
      postChanged(
        post([label('self-harm'), label('spam')]),
        post([label('spam'), label('self-harm')]),
      ),
    ).toBe(false);
  });
});

describe('updatePostEntry', () => {
  it('takes the larger label set a later response carries', () => {
    const first = updatePostEntry(undefined, post([label('self-harm')]));
    const larger = post([label('self-harm'), label('spam', OTHER_MODERATOR)]);

    const second = updatePostEntry(first, larger);

    expect(second.post.labels).toEqual([
      label('self-harm'),
      label('spam', OTHER_MODERATOR),
    ]);
    expect(second.originalPost).toBe(larger);
  });

  it('keeps the post reference when the label set is unchanged', () => {
    const first = updatePostEntry(undefined, post([label('self-harm')]));
    const second = updatePostEntry(first, post([label('self-harm')]));

    expect(second.post).toBe(first.post);
  });
});
