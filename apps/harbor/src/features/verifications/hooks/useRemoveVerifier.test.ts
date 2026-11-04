// The barrel pulls in native uniffi init at import time; use the stand-in.
jest.mock('@polycentric/react-native', () =>
  jest.requireActual('@/test/polycentric'),
);

const mockClient = {
  activeIdentityKey: 'me' as string | null,
  listValidEvents: jest.fn(
    async (
      _identity: string,
      _collection: number,
    ): Promise<V2.EventBundle[]> => [],
  ),
  publish: jest.fn(async (_content: V2.Content, _collection: number) => ({})),
  sync: jest.fn(async (_strategy?: unknown) => 0),
};

jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  ...jest.requireActual('@/src/common/lib/polycentric-hooks/helpers'),
  usePolycentric: () => mockClient,
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
import {
  eventBundle,
  verificationKey,
  verificationTargetContent,
} from '../__fixtures__/bundles';
import type { DecodedClaim } from './useClaimById';
import useRemoveVerifier, { removeVerifier } from './useRemoveVerifier';

function eventKey(sequence: number): V2.EventKey {
  return verificationKey('me', sequence, [1, 2, 3]);
}

function targetBundle(
  key: V2.EventKey,
  claimEventKey: V2.EventKey,
  targetIdentities: string[],
): V2.EventBundle {
  return eventBundle(
    key,
    verificationTargetContent(targetIdentities, claimEventKey),
  );
}

const CLAIM_KEY = eventKey(7);
const CLAIM_ID = eventKeyId(CLAIM_KEY);
const OTHER_CLAIM_KEY = eventKey(8);

const CLAIM: DecodedClaim = {
  id: CLAIM_ID,
  schemaName: 'Freeform',
  fields: [],
  identity: 'me',
  keyFingerprint: 'fp',
  sequence: 7n,
  createdAt: 0n,
};

function renderHook(claim: DecodedClaim = CLAIM): {
  current: ReturnType<typeof useRemoveVerifier>;
} {
  const result = { current: null as never };
  function Probe() {
    result.current = useRemoveVerifier(claim) as never;
    return null;
  }
  act(() => {
    TestRenderer.create(React.createElement(Probe));
  });
  return result;
}

/** The Delete event keys published, in order. */
function deletedKeys(): V2.EventKey[] {
  return mockClient.publish.mock.calls.map(([content, collection]) => {
    expect(collection).toBe(COLLECTION.VERIFICATIONS);
    const eventKey = contentAs(content, 'delete')?.eventKey;
    if (!eventKey) throw new Error('expected a delete');
    return eventKey;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.activeIdentityKey = 'me';
  mockClient.listValidEvents.mockResolvedValue([
    targetBundle(eventKey(10), CLAIM_KEY, ['them']),
    targetBundle(eventKey(11), CLAIM_KEY, ['other']),
    targetBundle(eventKey(12), OTHER_CLAIM_KEY, ['them']),
  ]);
});

describe('removeVerifier', () => {
  it('tombstones only the target naming the verifier on this claim', async () => {
    await removeVerifier(mockClient as never, CLAIM_ID, 'them');

    expect(deletedKeys()).toEqual([expect.objectContaining({ sequence: 10n })]);
    expect(mockClient.sync).toHaveBeenCalledWith(SyncStrategy.PartialPush);
  });

  it('tombstones every matching target', async () => {
    mockClient.listValidEvents.mockResolvedValue([
      targetBundle(eventKey(10), CLAIM_KEY, ['them']),
      targetBundle(eventKey(13), CLAIM_KEY, ['them']),
    ]);

    await removeVerifier(mockClient as never, CLAIM_ID, 'them');

    expect(deletedKeys().map((k) => k.sequence)).toEqual([10n, 13n]);
  });

  it('is a no-op without a matching target', async () => {
    await removeVerifier(mockClient as never, CLAIM_ID, 'nobody');

    expect(mockClient.publish).not.toHaveBeenCalled();
    expect(mockClient.sync).not.toHaveBeenCalled();
  });

  it('is a no-op without an active identity', async () => {
    mockClient.activeIdentityKey = null;

    await removeVerifier(mockClient as never, CLAIM_ID, 'them');

    expect(mockClient.listValidEvents).not.toHaveBeenCalled();
    expect(mockClient.publish).not.toHaveBeenCalled();
  });

  it('does not throw when the push fails', async () => {
    mockClient.sync.mockRejectedValueOnce(new Error('offline'));

    await expect(
      removeVerifier(mockClient as never, CLAIM_ID, 'them'),
    ).resolves.toBeUndefined();
    expect(mockClient.publish).toHaveBeenCalled();
  });
});

describe('useRemoveVerifier', () => {
  it('deletes the target and refreshes the affected queries', async () => {
    const hook = renderHook();
    await act(() => hook.current.submit('them'));

    expect(deletedKeys()).toHaveLength(1);
    expect(invalidateQuery).toHaveBeenCalledWith(mockClient, [
      'verification-targets',
      CLAIM_ID,
    ]);
    expect(invalidateQuery).toHaveBeenCalledWith(mockClient, [
      'claims-list',
      'me',
    ]);
    expect(invalidateQuery).toHaveBeenCalledWith(mockClient, [
      'targeted-verification-claims',
      'them',
    ]);
  });

  it('reports pending while the removal runs', async () => {
    let finish: () => void = () => {};
    mockClient.sync.mockReturnValueOnce(
      new Promise<number>((resolve) => {
        finish = () => resolve(0);
      }),
    );

    const hook = renderHook();
    expect(hook.current.isPending).toBe(false);

    let done: Promise<void> = Promise.resolve();
    await act(() => {
      done = hook.current.submit('them');
    });
    expect(hook.current.isPending).toBe(true);
    await expect(act(() => hook.current.submit('them'))).rejects.toBe(
      'Already pending',
    );

    await act(async () => {
      finish();
      await done;
    });
    expect(hook.current.isPending).toBe(false);
  });
});
