// `@polycentric/react-native`'s barrel pulls in native uniffi init at import
// time, which can't run under jest — expose just what the hooks need.
jest.mock('@polycentric/react-native', () => ({
  v2: jest.requireActual('../../../../../../packages/js-core/src/proto/v2'),
  COLLECTION: { VERIFICATIONS: 8 },
  Query: {
    ListEvents: function ListEvents() {},
  },
}));

// ESM-only; jest-expo doesn't transform it. The digest content is irrelevant.
jest.mock('@noble/hashes/sha2.js', () => ({
  sha256: () => new Uint8Array(32),
}));

jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  useCurrentIdentity: () => ({ identityKey: 'me' }),
}));

jest.mock('@/src/common/lib/polycentric-hooks/helpers', () => {
  const helpers = jest.requireActual(
    '@/src/common/lib/polycentric-hooks/helpers',
  );
  return {
    eventKeyId: helpers.eventKeyId,
    getKeyFingerprint: () => 'fingerprint',
  };
});

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
import { useVerificationRequestsTo } from './useVerificationRequestsTo';

const MY_IDENTITY = 'me';

function claimKey(sequence: number): v2.EventKey {
  return v2.EventKey.create({
    identity: MY_IDENTITY,
    collection: 8,
    sequence: BigInt(sequence),
  });
}

function claimBundle(key: v2.EventKey): v2.EventBundle {
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
  return bundle(key, content);
}

function targetBundle(
  key: v2.EventKey,
  claimEventKey: v2.EventKey,
  targetIdentities: string[],
): v2.EventBundle {
  const content = v2.Content.create({
    contentBody: {
      oneofKind: 'verificationTarget',
      verificationTarget: { claimEventKey, targetIdentities },
    },
  });
  return bundle(key, content);
}

function bundle(key: v2.EventKey, content: v2.Content): v2.EventBundle {
  const event = v2.Event.create({ key, createdAt: 1000n });
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

function respond(bundles: v2.EventBundle[]) {
  mockQueryData = v2.ListEventsResponse.toBinary(
    v2.ListEventsResponse.create({ eventBundles: bundles }),
  );
}

type HookResult = ReturnType<typeof useVerificationRequestsTo>;

function renderHook(targetIdentity: string | undefined): {
  current: HookResult;
} {
  const result: { current: HookResult } = { current: null as never };
  function Probe() {
    result.current = useVerificationRequestsTo(targetIdentity);
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

describe('useVerificationRequestsTo', () => {
  it('returns claims targeted at the identity, newest first', () => {
    const key1 = claimKey(1);
    const key2 = claimKey(2);
    respond([
      claimBundle(key1),
      claimBundle(key2),
      targetBundle(claimKey(3), key1, ['them']),
      targetBundle(claimKey(4), key2, ['them']),
    ]);

    const result = renderHook('them');
    expect(result.current.claims.map((c) => c.sequence)).toEqual([2n, 1n]);
  });

  it('excludes claims targeted at other identities', () => {
    const key = claimKey(1);
    respond([claimBundle(key), targetBundle(claimKey(2), key, ['other'])]);

    expect(renderHook('them').current.claims).toEqual([]);
  });

  it('excludes claims with no target', () => {
    respond([claimBundle(claimKey(1))]);

    expect(renderHook('them').current.claims).toEqual([]);
  });

  it('ignores targets referencing unknown claims', () => {
    respond([targetBundle(claimKey(2), claimKey(99), ['them'])]);

    expect(renderHook('them').current.claims).toEqual([]);
  });

  it('returns nothing without a target identity', () => {
    const key = claimKey(1);
    respond([claimBundle(key), targetBundle(claimKey(2), key, ['them'])]);

    expect(renderHook(undefined).current.claims).toEqual([]);
  });
});
