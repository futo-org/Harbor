jest.mock('@polycentric/react-native', () =>
  jest.requireActual('@/test/polycentric'),
);

let mockSequence = 0;
const mockClient = {
  publish: jest.fn(async (content: V2.Content, collection: number) => {
    const { publishedBundle } = jest.requireActual('../__fixtures__/bundles');
    return publishedBundle(content, collection, 'me', BigInt(++mockSequence));
  }),
  sync: jest.fn(async (_strategy?: unknown) => 0),
};

jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  ...jest.requireActual('@/src/common/lib/polycentric-hooks/helpers'),
  usePolycentric: () => mockClient,
  useCurrentIdentity: () => ({ identityKey: 'me' }),
}));

jest.mock('@/src/common/query/hooks/useQuery', () => ({
  invalidateQuery: jest.fn(),
}));

import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import { contentAs } from '@/src/common/lib/polycentric-hooks/helpers';
import {
  COLLECTION,
  eventKeyId,
  SyncStrategy,
  type v2 as V2,
} from '@polycentric/react-native';
import * as React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { verificationKey } from '../__fixtures__/bundles';
import useRequestVerification from './useRequestVerification';

// A claim id as it appears in `DecodedClaim.id`.
const CLAIM_ID = eventKeyId(verificationKey('me', 3n));

type HookResult = ReturnType<typeof useRequestVerification>;

function renderHook(): { current: HookResult } {
  const result: { current: HookResult } = { current: null as never };
  function Probe() {
    result.current = useRequestVerification();
    return null;
  }
  act(() => {
    TestRenderer.create(React.createElement(Probe));
  });
  return result;
}

async function submit() {
  const hook = renderHook();
  await act(async () => {
    await hook.current.submit({ claimId: CLAIM_ID, identity: 'them' });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSequence = 0;
});

describe('useRequestVerification', () => {
  it('publishes a target aiming the claim at the identity', async () => {
    await submit();

    expect(mockClient.publish).toHaveBeenCalledTimes(1);
    const [content, collection] = mockClient.publish.mock.calls[0];
    const target = contentAs(content, 'verificationTarget');
    if (!target) throw new Error('expected a verificationTarget');
    expect(target.targetIdentities).toEqual(['them']);
    expect(target.claimEventKey?.sequence).toBe(3n);
    expect(target.claimEventKey?.identity).toBe('me');

    expect(collection).toBe(COLLECTION.VERIFICATIONS);
    expect(mockClient.sync).toHaveBeenCalledWith(SyncStrategy.PartialPush);
  });

  it("refreshes the claim's verifiers", async () => {
    await submit();

    expect(invalidateQuery).toHaveBeenCalledWith(mockClient, [
      'verification-targets',
      CLAIM_ID,
    ]);
  });

  it('still resolves when the push to servers fails', async () => {
    mockClient.sync.mockRejectedValueOnce(new Error('offline'));

    await expect(submit()).resolves.toBeUndefined();
    expect(mockClient.publish).toHaveBeenCalledTimes(1);
    expect(invalidateQuery).toHaveBeenCalled();
  });
});
