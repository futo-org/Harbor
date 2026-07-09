// `@polycentric/react-native`'s barrel pulls in native uniffi init at import
// time, which can't run under jest — expose just what the hook needs.
jest.mock('@polycentric/react-native', () => ({
  v2: jest.requireActual('../../../../../../packages/js-core/src/proto/v2'),
  Query: {
    ListTargetedVerificationClaims:
      function ListTargetedVerificationClaims() {},
  },
}));

// ESM-only; jest-expo doesn't transform it. The digest content is irrelevant.
jest.mock('@noble/hashes/sha2.js', () => ({
  sha256: () => new Uint8Array(32),
}));

jest.mock('@/src/common/lib/polycentric-hooks/helpers', () => ({
  bytesToHex: (bytes: Uint8Array) => Buffer.from(bytes).toString('hex'),
  getKeyFingerprint: () => 'fingerprint',
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
    isLoading: false,
    refresh: jest.fn(),
  }),
  RefreshStrategy: { Lazy: 'lazy' },
}));

import { v2 } from '@polycentric/react-native';
import * as React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { useRequestedVerifications } from './useRequestedVerifications';

function claimBundle(owner: string, sequence: number): v2.EventBundle {
  const schema = v2.VerificationSchema.create({ name: 'Freeform' });
  const content = v2.Content.create({
    contentBody: {
      oneofKind: 'verificationClaim',
      verificationClaim: {
        schema: { schemaBytes: v2.VerificationSchema.toBinary(schema) },
        fields: {},
      },
    },
  });
  const event = v2.Event.create({
    key: v2.EventKey.create({
      identity: owner,
      collection: 8,
      sequence: BigInt(sequence),
    }),
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

function targetBundle(
  owner: string,
  targetIdentities: string[],
): v2.EventBundle {
  const content = v2.Content.create({
    contentBody: {
      oneofKind: 'verificationTarget',
      verificationTarget: { targetIdentities },
    },
  });
  const event = v2.Event.create({
    key: v2.EventKey.create({ identity: owner, collection: 8, sequence: 99n }),
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

function respond(claimBundles: v2.VerificationClaimBundle[]) {
  mockQueryData = v2.ListTargetedVerificationClaimsResponse.toBinary(
    v2.ListTargetedVerificationClaimsResponse.create({ claimBundles }),
  );
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
  mockQueryData = null;
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
