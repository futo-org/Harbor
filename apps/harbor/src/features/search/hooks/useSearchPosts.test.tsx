// `@polycentric/react-native`'s barrel pulls in native uniffi init at import
// time, which can't run under jest — expose just what the hook needs. The
// Query stub keeps the args it was constructed with so the tests can assert
// on what the hook passed in.
jest.mock('@polycentric/react-native', () => ({
  v2: jest.requireActual('../../../../../../packages/js-core/src/proto/v2'),
  Query: {
    SearchPosts: class SearchPosts {
      constructor(args: Record<string, unknown>) {
        Object.assign(this, args);
      }
    },
  },
  QueryStatus: { Loading: 'loading' },
  UpdateMode: { Merge: 'merge' },
  SearchPostsSort: { Default: 'default', Latest: 'latest' },
}));

jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  shouldExtend: () => true,
  decodeV2PostBundle: jest.fn(),
}));

jest.mock('@/src/common/settings/useOmitLabels', () => ({
  useOmitLabels: () => ['hate'],
}));

type CapturedQuery = {
  query: string;
  sortBy: string;
  omitLabels: string[];
  forwardToken?: string;
};
type QueryFactory = (status: unknown, data: unknown) => CapturedQuery;

let mockQueryData: Uint8Array | null = null;
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

import { v2 } from '@polycentric/react-native';
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
      signedBy: v2.PublicKey.create({ keyType: 1, key: new Uint8Array([1]) }),
    }),
    createdAt: BigInt(sequence),
  });
  const content = v2.Content.create({
    contentBody: { oneofKind: 'post', post: v2.Post.create({ text }) },
  });
  return v2.SearchResult.create({
    eventBundle: v2.EventBundle.create({
      signedEvent: v2.SignedEvent.create({
        eventBytes: v2.Event.toBinary(event),
        signature: new Uint8Array([0]),
      }),
      serializedContent: v2.SerializedContent.create({
        contentBytes: v2.Content.toBinary(content),
      }),
    }),
    rank,
  });
}

function respond(results: v2.SearchResult[], hasNextPage = false) {
  mockQueryData = v2.SearchPostsResponse.toBinary(
    v2.SearchPostsResponse.create({
      results,
      pageInfo: {
        startCursor: '',
        endCursor: 'token',
        hasPreviousPage: false,
        hasNextPage,
      },
    }),
  );
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
    expect(built?.query).toBe('hello');
    expect(built?.sortBy).toBe('default');
    expect(built?.omitLabels).toEqual(['hate']);
  });

  it('maps the latest sort onto the proto enum', () => {
    renderHook('hello', { sort: 'latest' });

    expect(capturedFactory?.(undefined, undefined)?.sortBy).toBe('latest');
  });

  it('keys the cache by sort and term', () => {
    renderHook('hello', { sort: 'latest' });

    expect(capturedKey).toEqual(['search_posts', 'latest', 'hello']);
  });

  it('extends with the previous response cursor', () => {
    respond([postResult('a post', 1)]);
    renderHook('hello');

    const built = capturedFactory?.(undefined, mockQueryData);
    expect(built?.forwardToken).toBe('token');
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
