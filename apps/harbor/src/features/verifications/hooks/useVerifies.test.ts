// `@polycentric/react-native`'s barrel pulls in native uniffi init at import
// time, which can't run under jest — expose just what the hook needs.
jest.mock('@polycentric/react-native', () => ({
  v2: jest.requireActual('../../../../../../packages/js-core/src/proto/v2'),
  Query: {
    ListEvents: function ListEvents() {},
  },
  COLLECTION: { VERIFICATIONS: 8 },
}));

// ESM-only; jest-expo doesn't transform it. The digest content is irrelevant.
jest.mock('@noble/hashes/sha2.js', () => ({
  sha256: () => new Uint8Array(32),
}));

let mockQueryData: Uint8Array | null = null;
jest.mock('@/src/common/query/hooks/useQuery', () => ({
  useQuery: (
    _key: string[],
    _query: unknown,
    _opts: unknown,
    enabled: boolean,
  ) => ({
    data: enabled ? mockQueryData : null,
    isLoading: false,
    hasPendingRefresh: false,
    refresh: jest.fn(),
  }),
  RefreshStrategy: { Lazy: 'lazy' },
}));

import { v2 } from '@polycentric/react-native';
import { act, createElement } from 'react';
import TestRenderer from 'react-test-renderer';
import { useVerifies } from './useVerifies';

function claimKey(identity: string, sequence: bigint): v2.EventKey {
  return v2.EventKey.create({
    identity,
    collection: 8,
    sequence,
    signedBy: v2.PublicKey.create({ keyType: 1, key: new Uint8Array([0xaa]) }),
  });
}

function verifyBundle(claim: v2.EventKey, sequence: bigint): v2.EventBundle {
  const event = v2.Event.create({
    key: v2.EventKey.create({ identity: 'me', collection: 8, sequence }),
  });
  return v2.EventBundle.create({
    signedEvent: v2.SignedEvent.create({
      eventBytes: v2.Event.toBinary(event),
      signature: new Uint8Array([0]),
    }),
    serializedContent: v2.SerializedContent.create({
      contentBytes: v2.Content.toBinary(
        v2.Content.create({
          contentBody: {
            oneofKind: 'verificationVerify',
            verificationVerify: { claimEventKey: claim },
          },
        }),
      ),
    }),
  });
}

function targetBundle(claim: v2.EventKey): v2.EventBundle {
  return v2.EventBundle.create({
    signedEvent: v2.SignedEvent.create({
      eventBytes: v2.Event.toBinary(
        v2.Event.create({
          key: v2.EventKey.create({
            identity: 'me',
            collection: 8,
            sequence: 99n,
          }),
        }),
      ),
      signature: new Uint8Array([0]),
    }),
    serializedContent: v2.SerializedContent.create({
      contentBytes: v2.Content.toBinary(
        v2.Content.create({
          contentBody: {
            oneofKind: 'verificationTarget',
            verificationTarget: { claimEventKey: claim, targetIdentities: [] },
          },
        }),
      ),
    }),
  });
}

function respond(bundles: v2.EventBundle[]) {
  mockQueryData = v2.ListEventsResponse.toBinary(
    v2.ListEventsResponse.create({ eventBundles: bundles }),
  );
}

type HookResult = ReturnType<typeof useVerifies>;

const renderers: TestRenderer.ReactTestRenderer[] = [];

function renderHook(identity: string | undefined): { current: HookResult } {
  const result: { current: HookResult } = { current: null as never };
  function Probe() {
    result.current = useVerifies(identity);
    return null;
  }
  act(() => {
    renderers.push(TestRenderer.create(createElement(Probe)));
  });
  return result;
}

afterEach(() => {
  act(() => {
    for (const renderer of renderers.splice(0)) renderer.unmount();
  });
  mockQueryData = null;
});

it('lists the verified claim keys, newest verify first', () => {
  respond([
    verifyBundle(claimKey('alice', 1n), 10n),
    verifyBundle(claimKey('bob', 2n), 20n),
  ]);

  const result = renderHook('me');

  expect(result.current.verifies.map((verify) => verify.identity)).toEqual([
    'bob',
    'alice',
  ]);
  expect(result.current.verifies[0].sequence).toBe(2n);
});

it('ignores other verification events and repeat verifies', () => {
  const claim = claimKey('alice', 1n);
  respond([
    targetBundle(claim),
    verifyBundle(claim, 10n),
    verifyBundle(claim, 11n),
  ]);

  const result = renderHook('me');

  expect(result.current.verifies).toHaveLength(1);
  expect(result.current.verifies[0].identity).toBe('alice');
});

it('returns nothing without an identity', () => {
  respond([verifyBundle(claimKey('alice', 1n), 10n)]);

  const result = renderHook(undefined);

  expect(result.current.verifies).toEqual([]);
});
