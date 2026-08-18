import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { feedQueryKeys } from './feedCache';

// The following feed is per-identity, and `mockActiveIdentityKey` is empty until
// the identity store has loaded. A query only re-subscribes when its key or
// `enabled` changes, so a cold load into /feed used to attach a fan-out with
// no follower and never retry — no GetFollowingFeed request at all.

let mockActiveIdentityKey = '';

type CapturedCall = {
  queryKey: string[];
  enabled: boolean;
  query: Record<string, unknown>;
};
let mockCaptured: CapturedCall[] = [];

jest.mock('@/src/common/query/hooks/useQuery', () => ({
  useQuery: (
    queryKey: string[],
    factory: (s: unknown, d: unknown) => Record<string, unknown>,
    _opts: unknown,
    enabled: boolean,
  ) => {
    mockCaptured.push({
      queryKey,
      enabled,
      query: factory(undefined, undefined),
    });
    return {
      data: null,
      status: 'loading',
      hasPendingRefresh: false,
      error: null,
      refresh: jest.fn(),
      extend: jest.fn(),
    };
  },
  RefreshStrategy: { Lazy: 'lazy' },
}));

jest.mock('@polycentric/react-native', () => {
  const actual = jest.requireActual(
    '../../../../../../packages/js-core/src/proto/v2',
  );
  return {
    v2: actual,
    Query: {
      GetFollowingFeed: class GetFollowingFeed {
        constructor(args: Record<string, unknown>) {
          Object.assign(this, args);
        }
      },
    },
    QueryStatus: { Loading: 'loading' },
    UpdateMode: { Merge: 'merge' },
    FeedSort: { Default: 'default', Top: 'top', Latest: 'latest' },
  };
});

jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  shouldExtend: () => false,
  extractFeedToken: () => undefined,
  usePolycentricContext: () => ({
    client: { activeIdentityKey: mockActiveIdentityKey },
  }),
  decodeV2PostBundle: jest.fn(),
}));

jest.mock('@/src/common/settings/useOmitLabels', () => ({
  useOmitLabels: () => [],
}));

function renderFollowingFeed() {
  // Imported lazily so the mocks above are in place.
  const { useFollowingFeed } = jest.requireActual('./useFollowingFeed');
  function Probe() {
    useFollowingFeed({ enabled: true });
    return null;
  }
  act(() => {
    TestRenderer.create(<Probe />);
  });
  return mockCaptured[mockCaptured.length - 1];
}

beforeEach(() => {
  mockCaptured = [];
  mockActiveIdentityKey = '';
});

describe('feedQueryKeys.following', () => {
  it('partitions by identity and sort', () => {
    expect(feedQueryKeys.following('id-a', 'latest')).toEqual([
      'feed',
      'following',
      'id-a',
      'latest',
    ]);
  });

  it('is a prefix without `sort`, so cache invalidation matches every sort', () => {
    expect(feedQueryKeys.following('id-a')).toEqual([
      'feed',
      'following',
      'id-a',
    ]);
    const prefix = feedQueryKeys.following('id-a').join('\0');
    expect(
      feedQueryKeys.following('id-a', 'top').join('\0').startsWith(prefix),
    ).toBe(true);
  });
});

describe('useFollowingFeed', () => {
  it('holds the query until the identity is known', () => {
    const call = renderFollowingFeed();
    expect(call.enabled).toBe(false);
  });

  it('queries once the identity is known', () => {
    mockActiveIdentityKey = 'id-a';
    const call = renderFollowingFeed();
    expect(call.enabled).toBe(true);
    expect(call.query.followerIdentity).toBe('id-a');
  });

  it('changes the query key when the identity arrives, so the query re-subscribes', () => {
    const withoutIdentity = renderFollowingFeed().queryKey.join('\0');
    mockActiveIdentityKey = 'id-a';
    const withIdentity = renderFollowingFeed().queryKey.join('\0');
    expect(withIdentity).not.toBe(withoutIdentity);
  });
});
