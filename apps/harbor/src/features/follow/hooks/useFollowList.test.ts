// `@polycentric/react-native`'s barrel pulls in native uniffi init at import
// time, which can't run under jest — expose just what the hook needs.
jest.mock('@polycentric/react-native', () => ({
  v2: jest.requireActual('../../../../../../packages/js-core/src/proto/v2'),
  Query: {
    ListFollowing: function ListFollowing() {},
    ListFollowers: function ListFollowers() {},
  },
  QueryStatus: { Loading: 'loading' },
  UpdateMode: { Merge: 'merge' },
}));

jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  shouldExtend: () => true,
}));

let mockQueryData: Uint8Array | null = null;
jest.mock('@/src/common/query/hooks/useQuery', () => ({
  useQuery: (
    _key: unknown,
    _query: unknown,
    _opts: unknown,
    enabled: boolean,
  ) => ({
    data: enabled ? mockQueryData : null,
    status: 'idle',
    error: null,
    successfulServers: 1,
    extend: jest.fn(),
    refresh: jest.fn(),
  }),
  RefreshStrategy: { Lazy: 'lazy' },
}));

import { v2 } from '@polycentric/react-native';
import * as React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { type FollowListMode, useFollowList } from './useFollowList';

function followBundle(
  follower: string,
  target: string,
  sequence: number,
): v2.EventBundle {
  const event = v2.Event.create({
    key: v2.EventKey.create({
      identity: follower,
      collection: 5,
      sequence: BigInt(sequence),
    }),
    createdAt: BigInt(sequence),
  });
  const content = v2.Content.create({
    contentBody: { oneofKind: 'follow', follow: { identity: target } },
  });
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

function respond(bundles: v2.EventBundle[], hasNextPage = false) {
  mockQueryData = v2.ListFollowsResponse.toBinary(
    v2.ListFollowsResponse.create({
      eventBundles: bundles,
      pageInfo: {
        startCursor: '',
        endCursor: 'token',
        hasPreviousPage: false,
        hasNextPage,
      },
    }),
  );
}

type HookResult = ReturnType<typeof useFollowList>;

function renderHook(
  mode: FollowListMode,
  identity: string | null = 'them',
): { current: HookResult } {
  const result: { current: HookResult } = { current: null as never };
  function Probe() {
    result.current = useFollowList(mode, identity);
    return null;
  }
  act(() => {
    TestRenderer.create(React.createElement(Probe));
  });
  return result;
}

beforeEach(() => {
  mockQueryData = null;
});

describe('useFollowList', () => {
  it('lists followed identities for the following mode', () => {
    respond([followBundle('them', 'alice', 1), followBundle('them', 'bob', 2)]);

    const result = renderHook('following');
    expect(result.current.entries.map((e) => e.identity)).toEqual([
      'alice',
      'bob',
    ]);
  });

  it('lists follower identities for the followers mode', () => {
    respond([followBundle('alice', 'them', 1), followBundle('bob', 'them', 2)]);

    const result = renderHook('followers');
    expect(result.current.entries.map((e) => e.identity)).toEqual([
      'alice',
      'bob',
    ]);
  });

  it('dedupes repeated follow events per identity', () => {
    respond([
      followBundle('them', 'alice', 1),
      followBundle('them', 'alice', 2),
    ]);

    const result = renderHook('following');
    expect(result.current.entries).toHaveLength(1);
  });

  it('surfaces the next-page flag', () => {
    respond([followBundle('them', 'alice', 1)], true);

    expect(renderHook('following').current.hasMore).toBe(true);
  });

  it('returns nothing without an identity', () => {
    respond([followBundle('them', 'alice', 1)]);

    const result = renderHook('following', null);
    expect(result.current.entries).toEqual([]);
  });
});
