import { FeedSort } from '@polycentric/react-native';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { feedQueryKeys } from './feedCache';

let mockResolvedIdentity = '';

type CapturedCall = {
  queryKey: string[];
  enabled: boolean;
  query: { inner: [Record<string, unknown>] };
};
let mockCaptured: CapturedCall[] = [];

jest.mock('@/src/common/query/hooks/useQuery', () => ({
  useQuery: (
    queryKey: string[],
    factory: (s: unknown, d: unknown) => { inner: [Record<string, unknown>] },
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

jest.mock('@polycentric/react-native', () =>
  jest.requireActual('@/test/polycentric'),
);

jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  shouldExtend: () => false,
  extractFeedToken: () => undefined,
  useCurrentIdentity: () => ({
    identityKey: mockResolvedIdentity || null,
    hasIdentity: !!mockResolvedIdentity,
  }),
  decodeV2PostBundle: jest.fn(),
}));

jest.mock('@/src/common/settings/useOmitLabels', () => ({
  useOmitLabels: () => [],
}));

function renderRecommendedFeed() {
  // Imported lazily so the mocks above are in place.
  const { useRecommendedFeed } = jest.requireActual('./useRecommendedFeed');
  function Probe() {
    useRecommendedFeed({ enabled: true });
    return null;
  }
  act(() => {
    TestRenderer.create(<Probe />);
  });
  return mockCaptured[mockCaptured.length - 1];
}

beforeEach(() => {
  mockCaptured = [];
  mockResolvedIdentity = '';
});

describe('feedQueryKeys.recommended', () => {
  it('partitions by identity and carries no sort', () => {
    expect(feedQueryKeys.recommended('id-a')).toEqual([
      'feed',
      'recommended',
      'id-a',
    ]);
  });

  it('sits under the shared feed prefix', () => {
    expect(feedQueryKeys.recommended('id-a')[0]).toBe('feed');
  });
});

describe('useRecommendedFeed', () => {
  it('holds the query until the identity is known', () => {
    expect(renderRecommendedFeed().enabled).toBe(false);
  });

  it('requests the recommended feed for the resolved identity', () => {
    mockResolvedIdentity = 'id-a';

    const call = renderRecommendedFeed();
    expect(call.enabled).toBe(true);
    expect(call.query.inner[0].followerIdentity).toBe('id-a');
    expect(call.queryKey).toEqual(['feed', 'recommended', 'id-a']);
  });

  it('always asks for the top sort, without exposing the choice', () => {
    mockResolvedIdentity = 'id-a';

    expect(renderRecommendedFeed().query.inner[0].sortBy).toBe(FeedSort.Top);
  });
});
