// The barrel pulls in native uniffi init at import time — expose just what
// the hook needs.
jest.mock('@polycentric/react-native', () => ({
  v2: jest.requireActual('../../../../../../packages/js-core/src/proto/v2'),
  COLLECTION: { VERIFICATIONS: 8 },
  SyncStrategy: { PARTIAL_PUSH: 'partial-push' },
}));

const mockClient = {
  contentManager: { save: jest.fn(async () => undefined) },
  buildEvent: jest.fn(async () => ({})),
  signEvent: jest.fn(async (event: unknown) => ({ event })),
  commitEvent: jest.fn(
    async (_signed: unknown, _content: unknown) => undefined,
  ),
  sync: jest.fn(async () => undefined),
};

jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  usePolycentric: () => mockClient,
  hexToBytes: (hex: string) => Buffer.from(hex, 'hex'),
}));

jest.mock('@/src/common/query/hooks/useQuery', () => ({
  invalidateQuery: jest.fn(),
}));

const mockRouter = { canGoBack: jest.fn(() => true), back: jest.fn() };
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
}));

import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import type { v2 as V2 } from '@polycentric/react-native';
import * as React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import type { DecodedClaim } from './useClaimById';
import useClaimActions, { deleteClaim } from './useClaimActions';

const { v2 } = jest.requireMock('@polycentric/react-native') as {
  v2: typeof V2;
};

// A real claim id: the hex-encoded EventKey the hook decodes.
const CLAIM_KEY = v2.EventKey.create({
  collection: 8,
  identity: 'me',
  signedBy: v2.PublicKey.create({ key: new Uint8Array([1, 2, 3]) }),
  sequence: 7n,
});
const CLAIM_ID = Buffer.from(v2.EventKey.toBinary(CLAIM_KEY)).toString('hex');

const CLAIM: DecodedClaim = {
  id: CLAIM_ID,
  schemaName: 'Freeform',
  fields: [],
  identity: 'me',
  keyFingerprint: 'fp',
  sequence: 7n,
  createdAt: 0n,
};

function renderHook(): { current: ReturnType<typeof useClaimActions> } {
  const result = { current: null as never };
  function Probe() {
    result.current = useClaimActions(CLAIM) as never;
    return null;
  }
  act(() => {
    TestRenderer.create(React.createElement(Probe));
  });
  return result;
}

/** The Content committed by the first commitEvent call. */
function committedContent(): V2.Content {
  return mockClient.commitEvent.mock.calls[0][1] as V2.Content;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.canGoBack.mockReturnValue(true);
});

describe('deleteClaim', () => {
  it('commits a Delete event referencing the claim and pushes it', async () => {
    await deleteClaim(mockClient as never, CLAIM_ID);

    const content = committedContent();
    if (content.contentBody.oneofKind !== 'delete') {
      throw new Error('expected a delete');
    }
    expect(content.contentBody.delete.eventKey).toMatchObject({
      identity: 'me',
      sequence: 7n,
    });
    expect(mockClient.sync).toHaveBeenCalledWith('partial-push');
  });

  it('does not throw when the push fails', async () => {
    mockClient.sync.mockRejectedValueOnce(new Error('offline'));

    await expect(
      deleteClaim(mockClient as never, CLAIM_ID),
    ).resolves.toBeUndefined();
    expect(mockClient.commitEvent).toHaveBeenCalled();
  });
});

describe('useClaimActions', () => {
  it('deletes, refreshes the list, and leaves the screen', async () => {
    const hook = renderHook();
    await act(() => hook.current.deleteAsync());

    expect(committedContent().contentBody.oneofKind).toBe('delete');
    expect(invalidateQuery).toHaveBeenCalledWith(mockClient, [
      'claims-list',
      'me',
    ]);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('stays put when there is nowhere to go back to', async () => {
    mockRouter.canGoBack.mockReturnValue(false);

    const hook = renderHook();
    await act(() => hook.current.deleteAsync());

    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});
