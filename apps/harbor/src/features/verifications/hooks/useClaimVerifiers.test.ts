// `@polycentric/react-native`'s barrel pulls in native uniffi init at import
// time, which can't run under jest — expose just what the hook needs.
jest.mock('@polycentric/react-native', () => ({
  v2: jest.requireActual('../../../../../../packages/js-core/src/proto/v2'),
  Query: {
    ListVerificationTargets: function ListVerificationTargets() {},
    ListVerificationVerifies: function ListVerificationVerifies() {},
  },
}));

// ESM-only; jest-expo doesn't transform it. The digest content is irrelevant.
jest.mock('@noble/hashes/sha2.js', () => ({
  sha256: () => new Uint8Array(32),
}));

jest.mock('@/src/common/lib/polycentric-hooks/helpers', () => ({
  hexToBytes: (hex: string) => new Uint8Array(Buffer.from(hex, 'hex')),
}));

// Keyed by the query key's first segment so the targets and verifies
// queries can respond independently.
let mockQueryData: Record<string, Uint8Array | null> = {};
jest.mock('@/src/common/query/hooks/useQuery', () => ({
  useQuery: (
    key: string[],
    _query: unknown,
    _opts: unknown,
    enabled: boolean,
  ) => ({
    data: enabled ? mockQueryData[key[0]] : null,
    isLoading: false,
    refresh: jest.fn(),
  }),
  RefreshStrategy: { Lazy: 'lazy' },
}));

import { v2 } from '@polycentric/react-native';
import * as React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { useClaimVerifiers } from './useClaimVerifiers';

const CLAIM_KEY = v2.EventKey.create({
  identity: 'me',
  collection: 8,
  sequence: 7n,
  signedBy: v2.PublicKey.create({ keyType: 1, key: new Uint8Array([0xaa]) }),
});
const CLAIM_ID = Buffer.from(v2.EventKey.toBinary(CLAIM_KEY)).toString('hex');

function bundle(identity: string, content: v2.Content): v2.EventBundle {
  const event = v2.Event.create({
    key: v2.EventKey.create({ identity, collection: 8, sequence: 1n }),
    createdAt: 1000n,
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

function targetBundle(targetIdentities: string[]): v2.EventBundle {
  return bundle(
    'me',
    v2.Content.create({
      contentBody: {
        oneofKind: 'verificationTarget',
        verificationTarget: { claimEventKey: CLAIM_KEY, targetIdentities },
      },
    }),
  );
}

function verifyBundle(verifier: string): v2.EventBundle {
  return bundle(
    verifier,
    v2.Content.create({
      contentBody: {
        oneofKind: 'verificationVerify',
        verificationVerify: { claimEventKey: CLAIM_KEY },
      },
    }),
  );
}

function respond(targets: v2.EventBundle[], verifies: v2.EventBundle[] = []) {
  mockQueryData = {
    'verification-targets': v2.ListVerificationTargetsResponse.toBinary(
      v2.ListVerificationTargetsResponse.create({ eventBundles: targets }),
    ),
    'verification-verifies': v2.ListVerificationVerifiesResponse.toBinary(
      v2.ListVerificationVerifiesResponse.create({ eventBundles: verifies }),
    ),
  };
}

type HookResult = ReturnType<typeof useClaimVerifiers>;

function renderHook(claimId: string | undefined): { current: HookResult } {
  const result: { current: HookResult } = { current: null as never };
  function Probe() {
    result.current = useClaimVerifiers(claimId);
    return null;
  }
  act(() => {
    TestRenderer.create(React.createElement(Probe));
  });
  return result;
}

beforeEach(() => {
  mockQueryData = {};
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

  it('includes verify authors who were never asked', () => {
    respond([targetBundle(['bob'])], [verifyBundle('dave')]);

    const result = renderHook(CLAIM_ID);
    expect(result.current.verifiers).toEqual([
      { identity: 'bob', verified: false },
      { identity: 'dave', verified: true },
    ]);
    expect(result.current.verifiedCount).toBe(1);
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
