jest.mock('@polycentric/react-native', () =>
  jest.requireActual('@/test/polycentric'),
);

// Keyed by the query key's first segment so the targets and verifies
// queries can respond independently.
let mockQueryData: Record<string, QueryData | undefined> = {};
jest.mock('@/src/common/query/hooks/useQuery', () => ({
  useQuery: (
    key: string[],
    _query: unknown,
    _opts: unknown,
    enabled: boolean,
  ) => ({
    data: enabled ? mockQueryData[key[0]] : undefined,
    isLoading: false,
    refresh: jest.fn(),
  }),
  RefreshStrategy: { Lazy: 'lazy' },
}));

let mockVerifierBots: Set<string> | undefined;
jest.mock('./useVerifierIdentities', () => ({
  useVerifierIdentities: () => mockVerifierBots,
}));

import { eventKeyId, QueryData, v2 } from '@polycentric/react-native';
import * as React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  eventBundle,
  verificationKey,
  verificationTargetContent,
  verificationVerifyContent,
} from '../__fixtures__/bundles';
import { useClaimVerifiers } from './useClaimVerifiers';

const CLAIM_KEY = verificationKey('me', 7n);
const CLAIM_ID = eventKeyId(CLAIM_KEY);

function targetBundle(targetIdentities: string[]): v2.EventBundle {
  return eventBundle(
    verificationKey('me', 1n),
    verificationTargetContent(targetIdentities, CLAIM_KEY),
  );
}

function verifyBundle(verifier: string): v2.EventBundle {
  return eventBundle(
    verificationKey(verifier, 1n),
    verificationVerifyContent(CLAIM_KEY),
  );
}

function respond(targets: v2.EventBundle[], verifies: v2.EventBundle[] = []) {
  mockQueryData = {
    'verification-targets': new QueryData.VerificationTargets({
      response: v2.ListVerificationTargetsResponse.create({
        eventBundles: targets,
      }),
    }),
    'verification-verifies': new QueryData.VerificationVerifies({
      response: v2.ListVerificationVerifiesResponse.create({
        eventBundles: verifies,
      }),
    }),
  };
}

type HookResult = ReturnType<typeof useClaimVerifiers>;

function renderHook(
  claimId: string | undefined,
  schemaName?: string,
): { current: HookResult } {
  const result: { current: HookResult } = { current: null as never };
  function Probe() {
    result.current = useClaimVerifiers(claimId, schemaName);
    return null;
  }
  act(() => {
    TestRenderer.create(React.createElement(Probe));
  });
  return result;
}

beforeEach(() => {
  mockQueryData = {};
  mockVerifierBots = undefined;
});

describe('useClaimVerifiers', () => {
  it('flags each requested verifier with their verification status', () => {
    respond(
      [targetBundle(['bob']), targetBundle(['carol'])],
      [verifyBundle('bob')],
    );

    const result = renderHook(CLAIM_ID);
    expect(result.current.verifiers).toEqual([
      { identity: 'bob', verified: true },
      { identity: 'carol', verified: false },
    ]);
    expect(result.current.verifiedCount).toBe(1);
    expect(result.current.totalCount).toBe(2);
  });

  it('dedupes repeated requests to the same identity', () => {
    respond([targetBundle(['bob']), targetBundle(['bob', 'carol'])]);

    const result = renderHook(CLAIM_ID);
    expect(result.current.verifiers.map((v) => v.identity)).toEqual([
      'bob',
      'carol',
    ]);
  });

  it('ignores unasked verify authors', () => {
    respond([targetBundle(['bob'])], [verifyBundle('dave')]);

    const result = renderHook(CLAIM_ID);
    expect(result.current.verifiers).toEqual([
      { identity: 'bob', verified: false },
    ]);
    expect(result.current.verifiedCount).toBe(0);
  });

  it('only counts verifier bots on a platform claim', () => {
    mockVerifierBots = new Set(['bot']);
    respond([targetBundle(['bot', 'bob'])], [verifyBundle('bob')]);

    const result = renderHook(CLAIM_ID, 'Platform');
    expect(result.current.verifiers).toEqual([
      { identity: 'bot', verified: false },
    ]);
    expect(result.current.verifiedCount).toBe(0);
  });

  it('counts an unasked verifier bot on a platform claim', () => {
    mockVerifierBots = new Set(['bot']);
    respond([], [verifyBundle('bot')]);

    const result = renderHook(CLAIM_ID, 'Platform');
    expect(result.current.verifiers).toEqual([
      { identity: 'bot', verified: true },
    ]);
    expect(result.current.verifiedCount).toBe(1);
  });

  it('counts any requested verifier on a non-platform claim', () => {
    mockVerifierBots = new Set(['bot']);
    respond([targetBundle(['bob'])], [verifyBundle('bob')]);

    const result = renderHook(CLAIM_ID, 'Freeform');
    expect(result.current.verifiers).toEqual([
      { identity: 'bob', verified: true },
    ]);
  });

  it('returns nothing without a claim id', () => {
    respond([targetBundle(['bob'])]);

    const result = renderHook(undefined);
    expect(result.current.verifiers).toEqual([]);
    expect(result.current.totalCount).toBe(0);
  });

  it('returns nothing for a malformed claim id', () => {
    respond([targetBundle(['bob'])]);

    expect(renderHook('zz-not-hex').current.verifiers).toEqual([]);
  });
});
