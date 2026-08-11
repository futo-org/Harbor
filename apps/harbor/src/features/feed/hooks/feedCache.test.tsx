// `@polycentric/react-native`'s barrel pulls in native uniffi init at import
// time, which jest can't run
jest.mock('@polycentric/react-native', () => ({
  v2: jest.requireActual('../../../../../../packages/js-core/src/proto/v2'),
  COLLECTION: { GRAPH: 3 },
}));

jest.mock('@/src/common/query/hooks/useQuery', () => ({
  useQueryStore: { getState: () => ({ queries: new Map() }) },
  invalidateAllQueries: jest.fn(),
}));

import type { PostData } from '@/src/common/lib/polycentric-hooks/helpers';
import useBlocks from '@/src/features/block/hooks/useBlocks';
import { v2 } from '@polycentric/react-native';
import * as React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { useFeedDataStore, useFeedWithOverlays } from './feedCache';

const BLOCKED = 'blocked-author';
const ALLOWED = 'allowed-author';

function eventKey(identity: string, sequence: number): v2.EventKey {
  return v2.EventKey.create({
    identity,
    collection: 2,
    sequence: BigInt(sequence),
    signedBy: v2.PublicKey.create({ keyType: 1, key: new Uint8Array([1]) }),
  });
}

function bundle(key: v2.EventKey, content: v2.Content): v2.EventBundle {
  const event = v2.Event.create({ key, createdAt: BigInt(key.sequence) });
  return v2.EventBundle.create({
    signedEvent: v2.SignedEvent.create({
      eventBytes: v2.Event.toBinary(event),
      signature: new Uint8Array([0]),
    }),
    serializedContent: v2.SerializedContent.create({
      contentBytes: v2.Content.toBinary(content),
    }),
  });
}

function postBundle(
  identity: string,
  sequence: number,
  text: string,
): v2.EventBundle {
  return bundle(
    eventKey(identity, sequence),
    v2.Content.create({
      contentBody: { oneofKind: 'post', post: v2.Post.create({ text }) },
    }),
  );
}

function repostBundle(
  identity: string,
  sequence: number,
  target: v2.EventKey,
): v2.EventBundle {
  return bundle(
    eventKey(identity, sequence),
    v2.Content.create({
      contentBody: {
        oneofKind: 'repost',
        repost: v2.Repost.create({ post: target }),
      },
    }),
  );
}

/** Unfiltered feed response, with no blocks, to test if the client blocks */
function feedResponse(
  eventBundles: v2.EventBundle[],
  hints: v2.EventBundle[] = [],
): ArrayBuffer {
  const bytes = v2.GetFeedResponse.toBinary(
    v2.GetFeedResponse.create({
      eventBundles,
      eventHints: hints.map((eventBundle) =>
        v2.EventHint.create({ eventBundle }),
      ),
      pageInfo: {
        startCursor: '',
        endCursor: '',
        hasPreviousPage: false,
        hasNextPage: false,
      },
    }),
  );
  return new Uint8Array(bytes).buffer;
}

function setBlocked(identities: string[]): void {
  useBlocks.setState((state) => ({
    blocks: new Map(identities.map((identity) => [identity, true])),
    version: state.version + 1,
  }));
}

let rendered: TestRenderer.ReactTestRenderer | undefined;

function renderFeed(
  queryKey: string[],
  queryData: ArrayBuffer,
): { current: PostData[] } {
  const result: { current: PostData[] } = { current: [] };
  function Probe() {
    result.current = useFeedWithOverlays(queryKey, queryData);
    return null;
  }
  act(() => {
    rendered = TestRenderer.create(React.createElement(Probe));
  });
  return result;
}

beforeEach(() => {
  useBlocks.setState({ blocks: new Map(), version: 0 });
  useFeedDataStore.setState({ feedData: new Map() });
});

afterEach(() => {
  act(() => rendered?.unmount());
  rendered = undefined;
});

describe('client rendundant filtering', () => {
  it('drops posts authored by a blocked identity', () => {
    setBlocked([BLOCKED]);

    const result = renderFeed(
      ['backstop_authors'],
      feedResponse([
        postBundle(BLOCKED, 1, 'from blocked'),
        postBundle(ALLOWED, 2, 'from allowed'),
      ]),
    );

    expect(result.current.map((post) => post.content)).toEqual([
      'from allowed',
    ]);
  });

  it("drops a blocked identity's repost of an unblocked post", () => {
    setBlocked([BLOCKED]);

    const target = postBundle(ALLOWED, 1, 'reposted post');
    const result = renderFeed(
      ['backstop_reposts'],
      feedResponse([repostBundle(BLOCKED, 2, eventKey(ALLOWED, 1))], [target]),
    );

    expect(result.current).toEqual([]);
  });

  it('keeps an unblocked identity’s repost of an unblocked post', () => {
    setBlocked([BLOCKED]);

    const target = postBundle(ALLOWED, 1, 'reposted post');
    const result = renderFeed(
      ['backstop_repost_kept'],
      feedResponse(
        [repostBundle('someone-else', 2, eventKey(ALLOWED, 1))],
        [target],
      ),
    );

    expect(result.current.map((post) => post.content)).toEqual([
      'reposted post',
    ]);
  });

  it('re-derives on block and unblock without new query data', () => {
    const queryData = feedResponse([
      postBundle(BLOCKED, 1, 'from blocked'),
      postBundle(ALLOWED, 2, 'from allowed'),
    ]);

    const result = renderFeed(['backstop_versioning'], queryData);
    expect(result.current.map((post) => post.content)).toEqual([
      'from blocked',
      'from allowed',
    ]);

    act(() => setBlocked([BLOCKED]));
    expect(result.current.map((post) => post.content)).toEqual([
      'from allowed',
    ]);

    act(() => setBlocked([]));
    expect(result.current.map((post) => post.content)).toEqual([
      'from blocked',
      'from allowed',
    ]);
  });
});
