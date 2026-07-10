// `@polycentric/react-native`'s barrel pulls in native uniffi init at import
// time, which can't run under jest — expose just what the hooks need.
jest.mock('@polycentric/react-native', () => ({
  v2: jest.requireActual('../../../../../../packages/js-core/src/proto/v2'),
  COLLECTION: { VERIFICATIONS: 8 },
  SyncStrategy: { PARTIAL_PUSH: 'partial-push' },
}));

const mockClient = {
  contentManager: { save: jest.fn(async () => undefined) },
  buildEvent: jest.fn(async () => {
    const { v2 } = jest.requireMock('@polycentric/react-native');
    return v2.Event.create({
      key: v2.EventKey.create({
        identity: 'me',
        collection: 8,
        sequence: 9n,
      }),
    });
  }),
  signEvent: jest.fn(async (event: unknown) => ({ event })),
  commitEvent: jest.fn(
    async (_signed: unknown, _content: unknown) => undefined,
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
import useVerifyClaim from './useVerifyClaim';

// A claim event key as it appears in `DecodedClaim.id`.
const CLAIM_KEY = v2.EventKey.create({
  identity: 'them',
  collection: 8,
  sequence: 3n,
});
const CLAIM_ID = Buffer.from(v2.EventKey.toBinary(CLAIM_KEY)).toString('hex');

type HookResult = ReturnType<typeof useVerifyClaim>;

function renderHook(): { current: HookResult } {
  const result: { current: HookResult } = { current: null as never };
  function Probe() {
    result.current = useVerifyClaim();
    return null;
  }
  act(() => {
    TestRenderer.create(React.createElement(Probe));
  });
  return result;
}

async function verify() {
  const hook = renderHook();
  await act(async () => {
    await hook.current.verify({ claimId: CLAIM_ID });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useVerifyClaim', () => {
  it('publishes a verify referencing the claim', async () => {
    await verify();

    expect(mockClient.commitEvent).toHaveBeenCalledTimes(1);
    const content = mockClient.commitEvent.mock.calls[0][1] as v2.Content;
    if (content.contentBody.oneofKind !== 'verificationVerify') {
      throw new Error('expected a verificationVerify');
    }
    const verifyBody = content.contentBody.verificationVerify;
    expect(verifyBody.claimEventKey?.sequence).toBe(3n);
    expect(verifyBody.claimEventKey?.identity).toBe('them');

    expect(mockClient.buildEvent).toHaveBeenCalledWith(content, 8);
    expect(mockClient.sync).toHaveBeenCalledWith('partial-push');
  });

  it('refreshes the verifiers list and the verification inbox', async () => {
    await verify();

    expect(invalidateQuery).toHaveBeenCalledWith(mockClient, [
      'verification-verifies',
      CLAIM_ID,
    ]);
    expect(invalidateQuery).toHaveBeenCalledWith(mockClient, [
      'targeted-verification-claims',
      'me',
    ]);
  });

  it('still resolves when the push to servers fails', async () => {
    mockClient.sync.mockRejectedValueOnce(new Error('offline'));

    await expect(verify()).resolves.toBeUndefined();
    expect(mockClient.commitEvent).toHaveBeenCalledTimes(1);
    expect(invalidateQuery).toHaveBeenCalled();
  });
});
