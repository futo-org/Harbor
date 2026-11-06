// `@polycentric/react-native`'s barrel pulls in native uniffi init at import
// time, which can't run under jest — expose just what the hooks need.
jest.mock('@polycentric/react-native', () => ({
  v2: jest.requireActual('../../../../../../packages/js-core/src/proto/v2'),
  COLLECTION: { VERIFICATIONS: 8 },
  SyncStrategy: { PARTIAL_PUSH: 'partial-push' },
}));

const mockClient = {
  createEvent: jest.fn(
    async (_args: { collection: number; content: v2.Content }) => ({}),
  ),
  sync: jest.fn(async () => undefined),
};

jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  usePolycentric: () => mockClient,
  useCurrentIdentity: () => ({ identityKey: 'me' }),
  hexToBytes: (hex: string) => Uint8Array.from(Buffer.from(hex, 'hex')),
}));

jest.mock('@/src/common/query/hooks/useQuery', () => ({
  invalidateQuery: jest.fn(),
}));

import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import { v2 } from '@polycentric/react-native';
import * as React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import useRequestVerification from './useRequestVerification';

// A claim event key as it appears in `DecodedClaim.id`.
const CLAIM_KEY = v2.EventKey.create({
  identity: 'me',
  collection: 8,
  sequence: 3n,
});
const CLAIM_ID = Buffer.from(v2.EventKey.toBinary(CLAIM_KEY)).toString('hex');

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
});

describe('useRequestVerification', () => {
  it('publishes a target aiming the claim at the identity', async () => {
    await submit();

    expect(mockClient.createEvent).toHaveBeenCalledTimes(1);
    const { collection, content } = mockClient.createEvent.mock.calls[0][0];
    expect(collection).toBe(8);
    if (content.contentBody.oneofKind !== 'verificationTarget') {
      throw new Error('expected a verificationTarget');
    }
    const target = content.contentBody.verificationTarget;
    expect(target.targetIdentities).toEqual(['them']);
    expect(target.claimEventKey?.sequence).toBe(3n);
    expect(target.claimEventKey?.identity).toBe('me');

    expect(mockClient.sync).toHaveBeenCalledWith('partial-push');
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
    expect(mockClient.createEvent).toHaveBeenCalledTimes(1);
    expect(invalidateQuery).toHaveBeenCalled();
  });
});
