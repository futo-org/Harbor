jest.mock('@polycentric/react-native', () =>
  jest.requireActual('@/test/polycentric'),
);

jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  shouldExtend: () => true,
}));

jest.mock('@/src/common/settings/useOmitLabels', () => ({
  useOmitLabels: () => ['hate'],
}));

type CapturedQuery = {
  inner: [
    {
      query: string;
      sortBy: SearchPostsSort;
      omitLabels: string[];
      forwardToken?: string;
    },
  ];
};
type QueryFactory = (status: unknown, data: unknown) => CapturedQuery;

let mockQueryData: QueryData | null = null;
let capturedKey: string[] | null = null;
let capturedFactory: QueryFactory | null = null;
let capturedEnabled: boolean | null = null;
jest.mock('@/src/common/query/hooks/useQuery', () => ({
  useQuery: (
    key: string[],
    factory: QueryFactory,
    _opts: unknown,
    enabled: boolean,
  ) => {
    capturedKey = key;
    capturedFactory = factory;
    capturedEnabled = enabled;
    return {
      data: enabled ? mockQueryData : null,
      status: 'idle',
      error: null,
      successfulServers: 1,
      hasPendingRefresh: false,
      extend: jest.fn(),
      refresh: jest.fn(),
    };
  },
  RefreshStrategy: { Lazy: 'lazy' },
}));

import { QueryData, SearchPostsSort, v2 } from '@polycentric/react-native';
import * as React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { useSearchPosts } from './useSearchPosts';

function postResult(text: string, sequence: number, rank = 1): v2.SearchResult {
  const event = v2.Event.create({
    key: v2.EventKey.create({
      identity: 'author',
      collection: 2,
      sequence: BigInt(sequence),
      signedBy: v2.PublicKey.create({
        keyType: v2.KeyType.Ed25519,
        key: new Uint8Array([1]).buffer,
      }),
    }),
    createdAt: BigInt(sequence),
  });
  const content = v2.Content.create({
    contentBody: new v2.ContentBody.Post({ post: v2.Post.create({ text }) }),
  });
  return v2.SearchResult.create({
    eventBundle: v2.EventBundle.create({
      signedEvent: v2.SignedEvent.create({
        event,
        signature: new Uint8Array([0]).buffer,
      }),
      serializedContent: v2.SerializedContent.create({ content }),
    }),
    rank,
  });
}

function respond(results: v2.SearchResult[], hasNextPage = false) {
  mockQueryData = new QueryData.SearchPosts({
    response: v2.SearchPostsResponse.create({
      results,
      pageInfo: {
        startCursor: '',
        endCursor: 'token',
        hasPreviousPage: false,
        hasNextPage,
      },
    }),
    labels: [],
  });
}

type HookResult = ReturnType<typeof useSearchPosts>;

function renderHook(
  query: string,
  options?: Parameters<typeof useSearchPosts>[1],
): { current: HookResult } {
  const result: { current: HookResult } = { current: null as never };
  function Probe() {
    result.current = useSearchPosts(query, options);
    return null;
  }
  act(() => {
    TestRenderer.create(React.createElement(Probe));
  });
  return result;
}

beforeEach(() => {
  mockQueryData = null;
  capturedKey = null;
  capturedFactory = null;
  capturedEnabled = null;
});

describe('useSearchPosts', () => {
  it('builds a SearchPosts query with term, sort, and omit labels', () => {
    renderHook('hello');

    const built = capturedFactory?.(undefined, undefined);
    expect(built?.inner[0].query).toBe('hello');
    expect(built?.inner[0].sortBy).toBe(SearchPostsSort.Default);
    expect(built?.inner[0].omitLabels).toEqual(['hate']);
  });

  it('maps the latest sort onto the proto enum', () => {
    renderHook('hello', { sort: 'latest' });

    expect(capturedFactory?.(undefined, undefined)?.inner[0].sortBy).toBe(
      SearchPostsSort.Latest,
    );
  });

  it('keys the cache by sort and term', () => {
    renderHook('hello', { sort: 'latest' });

    expect(capturedKey).toEqual(['search_posts', 'latest', 'hello']);
  });

  it('extends with the previous response cursor', () => {
    respond([postResult('a post', 1)]);
    renderHook('hello');

    const built = capturedFactory?.(undefined, mockQueryData);
    expect(built?.inner[0].forwardToken).toBe('token');
  });

  it('decodes results into feed items with page info', () => {
    respond([postResult('first', 1), postResult('second', 2)], true);

    const result = renderHook('decoding-test');
    expect(result.current.items.map((p) => p.content)).toEqual([
      'first',
      'second',
    ]);
    expect(result.current.hasMore).toBe(true);
  });

  it('is disabled for an empty query', () => {
    respond([postResult('a post', 1)]);

    const result = renderHook('');
    expect(capturedEnabled).toBe(false);
    expect(result.current.items).toEqual([]);
  });
});
