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

jest.mock('@/src/common/lib/polycentric-hooks/helpers', () => ({
  ...jest.requireActual('@/src/common/lib/polycentric-hooks/helpers'),
  getKeyFingerprint: (key?: unknown) => (key ? 'fingerprint' : undefined),
}));

jest.mock('@/src/common/query/hooks/useQuery', () => ({
  invalidateQuery: jest.fn(),
}));

let mockRequestFrom: string | undefined;
jest.mock('../claims/create/ClaimCreateContext', () => ({
  useClaimCreateOptions: () => ({ requestFrom: mockRequestFrom }),
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
import { formToSchema } from '../utils/schemas';
import useCreateClaim, { type ClaimRef } from './useCreateClaim';

const SCHEMA = formToSchema({
  name: 'Occupation',
  fields: [{ key: 'job_title', label: 'Job Title', required: true }],
});

type HookResult = ReturnType<typeof useCreateClaim>;

function renderHook(): { current: HookResult } {
  const result: { current: HookResult } = { current: null as never };
  function Probe() {
    result.current = useCreateClaim();
    return null;
  }
  act(() => {
    TestRenderer.create(React.createElement(Probe));
  });
  return result;
}

async function submit(values: Record<string, string>) {
  const hook = renderHook();
  let ref: ClaimRef | undefined;
  await act(async () => {
    ref = await hook.current.submit({ schema: SCHEMA, values });
  });
  return ref;
}

/** Content published by the nth publish call. */
function publishedContent(call: number): V2.Content {
  return mockClient.publish.mock.calls[call][0];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSequence = 0;
  mockRequestFrom = undefined;
});

describe('useCreateClaim', () => {
  it('commits a claim event and returns its ref', async () => {
    const ref = await submit({ job_title: 'Developer' });

    expect(mockClient.publish).toHaveBeenCalledTimes(1);
    expect(mockClient.publish.mock.calls[0][1]).toBe(COLLECTION.VERIFICATIONS);
    const claim = contentAs(publishedContent(0), 'verificationClaim');
    if (!claim) throw new Error('expected a verificationClaim');
    expect(claim.schema?.schema).toEqual(SCHEMA);
    // rs-core derives the schema digest when it publishes.
    expect(claim.schema?.schema?.name).toBeTruthy();
    expect(new TextDecoder().decode(claim.fields.get('job_title'))).toBe(
      'Developer',
    );

    expect(mockClient.sync).toHaveBeenCalledWith(SyncStrategy.PartialPush);
    expect(invalidateQuery).toHaveBeenCalledWith(mockClient, [
      'claims-list',
      'me',
    ]);
    expect(ref).toEqual({
      // The key of the bundle `publish` returned.
      id: eventKeyId(verificationKey('me', 1n)),
      identity: 'me',
      keyFingerprint: 'fingerprint',
      sequence: '1',
    });
  });

  it('omits empty fields from the claim', async () => {
    await submit({ job_title: 'Developer', description: '  ' });

    const claim = contentAs(publishedContent(0), 'verificationClaim');
    expect([...(claim?.fields.keys() ?? [])]).toEqual(['job_title']);
  });

  it('also publishes a target when requesting from an identity', async () => {
    mockRequestFrom = 'them';
    await submit({ job_title: 'Developer' });

    expect(mockClient.publish).toHaveBeenCalledTimes(2);
    const target = contentAs(publishedContent(1), 'verificationTarget');
    if (!target) throw new Error('expected a verificationTarget');
    expect(target.targetIdentities).toEqual(['them']);
    // Points at the claim event committed first.
    expect(target.claimEventKey?.sequence).toBe(1n);
  });

  it('does not publish a target without requestFrom', async () => {
    await submit({ job_title: 'Developer' });

    expect(mockClient.publish).toHaveBeenCalledTimes(1);
  });
});
