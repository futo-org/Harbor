// The barrel pulls in native uniffi init at import time; use the stand-in.
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
import type { DecodedClaim } from './useClaimById';
import useClaimActions, { deleteClaim } from './useClaimActions';

// A real claim id: the event key id the hook decodes.
const CLAIM_ID = eventKeyId(verificationKey('me', 7n, [1, 2, 3]));

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

/** The Content published by the first publish call. */
function publishedContent(): V2.Content {
  return mockClient.publish.mock.calls[0][0];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSequence = 0;
  mockRouter.canGoBack.mockReturnValue(true);
});

describe('deleteClaim', () => {
  it('commits a Delete event referencing the claim and pushes it', async () => {
    await deleteClaim(mockClient as never, CLAIM_ID);

    expect(mockClient.publish.mock.calls[0][1]).toBe(COLLECTION.VERIFICATIONS);
    expect(contentAs(publishedContent(), 'delete')?.eventKey).toMatchObject({
      identity: 'me',
      sequence: 7n,
    });
    expect(mockClient.sync).toHaveBeenCalledWith(SyncStrategy.PartialPush);
  });

  it('does not throw when the push fails', async () => {
    mockClient.sync.mockRejectedValueOnce(new Error('offline'));

    await expect(
      deleteClaim(mockClient as never, CLAIM_ID),
    ).resolves.toBeUndefined();
    expect(mockClient.publish).toHaveBeenCalled();
  });
});

describe('useClaimActions', () => {
  it('deletes, refreshes the list, and leaves the screen', async () => {
    const hook = renderHook();
    await act(() => hook.current.deleteAsync());

    expect(contentAs(publishedContent(), 'delete')).toBeDefined();
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
