const mockClient = { activeIdentityKey: 'me-key' };
jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  usePolycentric: () => mockClient,
}));

jest.mock('@/src/common/query/hooks/useQuery', () => ({
  invalidateQuery: jest.fn(),
}));

// Pass the form through so tests can see the claim values directly.
jest.mock('../utils/schemas', () => ({
  formToSchema: (form: unknown) => form,
}));

jest.mock('../utils/platforms', () => ({
  PLATFORM_SCHEMA_NAME: 'Platform',
}));

const mockApi = {
  getClaimFieldsByUrl: jest.fn(async () => [{ key: 0, value: 'futo' }]),
  checkTextClaim: jest.fn(async () => undefined),
  requestTextVerify: jest.fn(async () => undefined),
};
jest.mock('../utils/verifier-api', () => ({
  // Lazy: jest hoists this factory above the const.
  get verifierApi() {
    return mockApi;
  },
}));

const mockCreateSubmit = jest.fn(async () => ({
  id: 'claim-id',
  identity: 'me',
  keyFingerprint: 'fp',
  sequence: '1',
}));
jest.mock('./useCreateClaim', () => ({
  __esModule: true,
  default: () => ({ isPending: false, submit: mockCreateSubmit }),
}));

const mockDeleteClaim = jest.fn(async () => undefined);
jest.mock('./useClaimActions', () => ({
  deleteClaim: (...args: unknown[]) =>
    mockDeleteClaim(...(args as [never, never])),
}));

import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import * as React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import type { Platform } from '../utils/platforms';
import useVerifyPlatformClaim, {
  platformClaimParts,
} from './useVerifyPlatformClaim';

const GITHUB = { name: 'GitHub', slug: 'github' } as Platform;

type HookResult = ReturnType<typeof useVerifyPlatformClaim>;

function renderHook(): { current: HookResult } {
  const result: { current: HookResult } = { current: null as never };
  function Probe() {
    result.current = useVerifyPlatformClaim();
    return null;
  }
  act(() => {
    TestRenderer.create(React.createElement(Probe));
  });
  return result;
}

async function submit(profileUrl = 'github.com/futo') {
  const hook = renderHook();
  return act(() => hook.current.submit({ platform: GITHUB, profileUrl }));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('platformClaimParts', () => {
  it('builds slug, account fields, and url values', () => {
    const { values } = platformClaimParts(
      GITHUB,
      [
        { key: 1, value: 'id-1' },
        { key: 0, value: 'futo' },
      ],
      'https://github.com/futo',
    );
    expect(values).toEqual({
      platform: 'github',
      account: 'futo',
      account_id: 'id-1',
      url: 'https://github.com/futo',
    });
  });

  it('omits the url when there is none', () => {
    const { values } = platformClaimParts(GITHUB, [{ key: 0, value: 'futo' }]);
    expect(values).toEqual({ platform: 'github', account: 'futo' });
  });
});

describe('useVerifyPlatformClaim', () => {
  it('checks the profile, publishes, then verifies', async () => {
    const ref = await submit();

    expect(mockApi.getClaimFieldsByUrl).toHaveBeenCalledWith(
      'github',
      'https://github.com/futo', // scheme added
    );
    expect(mockApi.checkTextClaim).toHaveBeenCalledWith(
      'github',
      [{ key: 0, value: 'futo' }],
      'me-key',
    );
    expect(mockCreateSubmit).toHaveBeenCalled();
    expect(mockApi.requestTextVerify).toHaveBeenCalledWith(
      'github',
      'claim-id',
    );
    expect(invalidateQuery).toHaveBeenCalledWith(mockClient, [
      'verification-verifies',
      'claim-id',
    ]);
    expect(ref.id).toBe('claim-id');
  });

  it('creates nothing when the pre-check fails', async () => {
    mockApi.checkTextClaim.mockRejectedValueOnce(
      new Error('Unable to find token'),
    );

    await expect(submit()).rejects.toThrow('Unable to find token');
    expect(mockCreateSubmit).not.toHaveBeenCalled();
    expect(mockDeleteClaim).not.toHaveBeenCalled();
  });

  it('rolls the claim back when verify fails after publishing', async () => {
    mockApi.requestTextVerify.mockRejectedValueOnce(new Error('server down'));

    await expect(submit()).rejects.toThrow('server down');
    expect(mockDeleteClaim).toHaveBeenCalledWith(mockClient, 'claim-id');
  });
});
