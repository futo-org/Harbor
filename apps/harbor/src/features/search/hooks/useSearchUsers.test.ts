// `@polycentric/react-native`'s barrel pulls in native uniffi init at import
// time, which can't run under jest — expose just what the hook needs.
jest.mock('@polycentric/react-native', () => ({
  v2: jest.requireActual('../../../../../../packages/js-core/src/proto/v2'),
  Query: {
    SearchUsers: function SearchUsers() {},
  },
  QueryStatus: { Loading: 'loading' },
  UpdateMode: { Merge: 'merge' },
}));

jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  shouldExtend: () => true,
}));

let mockQueryData: Uint8Array | null = null;
let capturedEnabled: boolean | null = null;
jest.mock('@/src/common/query/hooks/useQuery', () => ({
  useQuery: (
    _key: unknown,
    _query: unknown,
    _opts: unknown,
    enabled: boolean,
  ) => {
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
import { useSearchUsers } from './useSearchUsers';

function profileResult(
  identity: string,
  sequence: number,
  rank = 1,
): v2.SearchResult {
  const event = v2.Event.create({
    key: v2.EventKey.create({
      identity,
      collection: 3,
      sequence: BigInt(sequence),
    }),
  });
  return v2.SearchResult.create({
    eventBundle: v2.EventBundle.create({
      signedEvent: v2.SignedEvent.create({
        eventBytes: v2.Event.toBinary(event),
        signature: new Uint8Array([0]),
      }),
    }),
    rank,
  });
}

function respond(results: v2.SearchResult[], hasNextPage = false) {
  mockQueryData = v2.SearchUsersResponse.toBinary(
    v2.SearchUsersResponse.create({
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

type HookResult = ReturnType<typeof useSearchUsers>;

function renderHook(
  query: string,
  options?: Parameters<typeof useSearchUsers>[1],
): { current: HookResult } {
  const result: { current: HookResult } = { current: null as never };
  function Probe() {
    result.current = useSearchUsers(query, options);
    return null;
  }
  act(() => {
    TestRenderer.create(React.createElement(Probe));
  });
  return result;
}

beforeEach(() => {
  mockQueryData = null;
  capturedEnabled = null;
});

describe('useSearchUsers', () => {
  it('decodes matched identities from profile events', () => {
    respond([profileResult('alice', 1), profileResult('bob', 1)]);

    const result = renderHook('ali');
    expect(result.current.entries.map((e) => e.identity)).toEqual([
      'alice',
      'bob',
    ]);
  });

  it('dedupes repeated matches per identity', () => {
    respond([profileResult('alice', 1), profileResult('alice', 2)]);

    const result = renderHook('ali');
    expect(result.current.entries).toHaveLength(1);
  });

  it('skips results without a signed event', () => {
    respond([v2.SearchResult.create({ rank: 1 }), profileResult('alice', 1)]);

    const result = renderHook('ali');
    expect(result.current.entries.map((e) => e.identity)).toEqual(['alice']);
  });

  it('surfaces the next-page flag', () => {
    respond([profileResult('alice', 1)], true);

    expect(renderHook('ali').current.hasMore).toBe(true);
  });

  it('is disabled for an empty query', () => {
    respond([profileResult('alice', 1)]);

    const result = renderHook('');
    expect(capturedEnabled).toBe(false);
    expect(result.current.entries).toEqual([]);
  });

  it('is disabled when the caller disables it', () => {
    respond([profileResult('alice', 1)]);

    renderHook('ali', { enabled: false });
    expect(capturedEnabled).toBe(false);
  });
});
