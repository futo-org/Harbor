jest.mock('@polycentric/react-native', () =>
  jest.requireActual('@/test/polycentric'),
);

jest.mock('@/src/common/lib/polycentric-hooks/helpers', () => ({
  ...jest.requireActual('@/src/common/lib/polycentric-hooks/helpers'),
  getKeyFingerprint: () => 'fingerprint',
}));

let mockQueryData: QueryData | undefined;
jest.mock('@/src/common/query/hooks/useQuery', () => ({
  useQuery: (
    _key: unknown,
    _query: unknown,
    _opts: unknown,
    enabled: boolean,
  ) => ({
    data: enabled ? mockQueryData : undefined,
    isLoading: false,
    refresh: jest.fn(),
  }),
  RefreshStrategy: { Lazy: 'lazy' },
}));

import { QueryData, v2 } from '@polycentric/react-native';
import * as React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  eventBundle,
  verificationClaimContent,
  verificationKey,
  verificationTargetContent,
} from '../__fixtures__/bundles';
import { useRequestedVerifications } from './useRequestedVerifications';

function claimBundle(owner: string, sequence: number): v2.EventBundle {
  return eventBundle(
    verificationKey(owner, sequence),
    verificationClaimContent(
      v2.VerificationSchema.create({ name: 'Freeform' }),
    ),
  );
}

function targetBundle(
  owner: string,
  targetIdentities: string[],
): v2.EventBundle {
  return eventBundle(
    verificationKey(owner, 99n),
    verificationTargetContent(targetIdentities),
  );
}

function respond(claimBundles: v2.VerificationClaimBundle[]) {
  mockQueryData = new QueryData.TargetedVerificationClaims({
    response: v2.ListTargetedVerificationClaimsResponse.create({
      claimBundles,
    }),
  });
}

type HookResult = ReturnType<typeof useRequestedVerifications>;

function renderHook(identity: string | undefined): { current: HookResult } {
  const result: { current: HookResult } = { current: null as never };
  function Probe() {
    result.current = useRequestedVerifications(identity);
    return null;
  }
  act(() => {
    TestRenderer.create(React.createElement(Probe));
  });
  return result;
}

beforeEach(() => {
  mockQueryData = undefined;
});

describe('useRequestedVerifications', () => {
  it('returns the requested claims, newest first', () => {
    respond([
      { claim: claimBundle('alice', 1), targets: [], verifies: [] },
      { claim: claimBundle('bob', 2), targets: [], verifies: [] },
    ]);

    const result = renderHook('me');
    expect(result.current.claims.map((c) => c.sequence)).toEqual([2n, 1n]);
    expect(result.current.claims.map((c) => c.identity)).toEqual([
      'bob',
      'alice',
    ]);
  });

  it('carries each claim’s verification status', () => {
    respond([
      {
        claim: claimBundle('alice', 1),
        targets: [targetBundle('alice', ['me', 'carol'])],
        verifies: [],
      },
    ]);

    const result = renderHook('me');
    expect(result.current.claims[0].status).toEqual({
      verifiers: [
        { identity: 'me', verified: false },
        { identity: 'carol', verified: false },
      ],
      verifiedCount: 0,
      totalCount: 2,
    });
  });

  it('returns nothing without an identity', () => {
    respond([{ claim: claimBundle('alice', 1), targets: [], verifies: [] }]);

    expect(renderHook(undefined).current.claims).toEqual([]);
  });
});
