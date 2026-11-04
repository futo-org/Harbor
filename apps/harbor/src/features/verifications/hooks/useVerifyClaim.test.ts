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

// The toast barrel pulls in Toaster, whose @rn-primitives/portal dependency
// ships untranspiled JSX that jest can't parse.
const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('@/src/common/components/toast', () => ({
  useToast: () => mockToast,
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
import useVerifyClaim from './useVerifyClaim';

// A claim id as it appears in `DecodedClaim.id`.
const CLAIM_ID = eventKeyId(verificationKey('them', 3n));

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
  mockSequence = 0;
});

describe('useVerifyClaim', () => {
  it('publishes a verify referencing the claim', async () => {
    await verify();

    expect(mockClient.publish).toHaveBeenCalledTimes(1);
    const [content, collection] = mockClient.publish.mock.calls[0];
    const verifyBody = contentAs(content, 'verificationVerify');
    if (!verifyBody) throw new Error('expected a verificationVerify');
    expect(verifyBody.claimEventKey?.sequence).toBe(3n);
    expect(verifyBody.claimEventKey?.identity).toBe('them');

    expect(collection).toBe(COLLECTION.VERIFICATIONS);
    expect(mockClient.sync).toHaveBeenCalledWith(SyncStrategy.PartialPush);
    expect(mockToast.success).toHaveBeenCalled();
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
    expect(mockClient.publish).toHaveBeenCalledTimes(1);
    expect(invalidateQuery).toHaveBeenCalled();
  });
});
