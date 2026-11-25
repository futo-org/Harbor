// `@polycentric/react-native-sdk`'s barrel pulls in native uniffi init at import
// time, which can't run under jest — expose just what the hook needs.
jest.mock('@polycentric/react-native-sdk', () => ({
  v2: jest.requireActual('../../../../../../packages/js/js-sdk/src/proto/v2'),
  Query: {
    ListTargetedVerificationClaims:
      function ListTargetedVerificationClaims() {},
  },
  labelsFromTargetedVerificationClaimsResponse: () => [],
}));

// ESM-only; jest-expo doesn't transform it. The digest content is irrelevant.
jest.mock('@noble/hashes/sha2.js', () => ({
  sha256: () => new Uint8Array(32),
}));

jest.mock('@/src/common/lib/polycentric-hooks/helpers', () => {
  const helpers = jest.requireActual(
    '@/src/common/lib/polycentric-hooks/helpers',
  );
  return {
    bytesToHex: helpers.bytesToHex,
    getKeyFingerprint: () => 'fingerprint',
    eventKeyId: helpers.eventKeyId,
    labelMapFromSets: () => mockLabelMap,
  };
});

jest.mock('@/src/common/settings/useOmitLabels', () => ({
  useOmitLabels: () => [],
}));

let mockQueryData: Uint8Array | null = null;
let mockLabelMap = new Map<string, PostLabel[]>();
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

import {
  eventKeyId,
  type PostLabel,
} from '@/src/common/lib/polycentric-hooks/helpers';
import { v2 } from '@polycentric/react-native-sdk';
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
        images: [],
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

const VIOLENCE: PostLabel = { value: 'violence', labeledBy: 'moderator' };

// The id `decodeClaimBundle` gives the claim `claimBundle` builds.
function claimId(owner: string, sequence: number): string {
  return eventKeyId(
    v2.EventKey.create({
      identity: owner,
      collection: 8,
      sequence: BigInt(sequence),
    }),
  );
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
  mockLabelMap = new Map();
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

  it('attaches each claim’s labels', () => {
    respond([{ claim: claimBundle('alice', 1), targets: [], verifies: [] }]);
    mockLabelMap = new Map([[claimId('alice', 1), [VIOLENCE]]]);

    expect(renderHook('me').current.claims[0].labels).toEqual([VIOLENCE]);
  });

  it('returns nothing without an identity', () => {
    respond([{ claim: claimBundle('alice', 1), targets: [], verifies: [] }]);

    expect(renderHook(undefined).current.claims).toEqual([]);
  });
});
