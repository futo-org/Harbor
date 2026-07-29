const mockClient = { activeIdentityKey: 'me-key' };
jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  usePolycentric: () => mockClient,
}));

jest.mock('@/src/common/query/hooks/useQuery', () => ({
  invalidateQuery: jest.fn(),
}));

jest.mock('../utils/schemas', () => ({
  formToSchema: (form: unknown) => form,
}));

jest.mock('../utils/platforms', () => ({
  PLATFORM_SCHEMA_NAME: 'Platform',
}));

const mockApi = {
  getOAuthUrl: jest.fn(async () => ({
    server: 'http://bot',
    url: 'https://x.com/oauth',
  })),
  getOAuthToken: jest.fn(async () => ({ username: 'me', token: 't0k' })),
  checkOAuthClaim: jest.fn(async () => undefined),
  requestOAuthVerify: jest.fn(async () => undefined),
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

const mockDeleteClaim = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('./useClaimActions', () => ({
  deleteClaim: (...args: unknown[]) => mockDeleteClaim(...args),
}));

const mockOpenAuthSession = jest.fn(
  async (..._args: unknown[]): Promise<{ type: string; url?: string }> => ({
    type: 'success',
    url: 'https://app/oauth/callback?state=STATE',
  }),
);
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...args: unknown[]) => mockOpenAuthSession(...args),
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock('expo-linking', () => ({
  createURL: (path: string) => `harbor://${path}`,
  parse: (url: string) => ({
    queryParams: {
      state: url.includes('state=STATE')
        ? JSON.stringify({ data: 'oauth-data' })
        : undefined,
    },
  }),
}));

import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import * as React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import type { Platform } from '../utils/platforms';
import useOAuthVerifyPlatformClaim from './useOAuthVerifyPlatformClaim';

const X = {
  name: 'X',
  slug: 'x',
  profileUrl: (account: string) => `https://x.com/${account}`,
} as Platform;

type HookResult = ReturnType<typeof useOAuthVerifyPlatformClaim>;

function renderHook(): { current: HookResult } {
  const result: { current: HookResult } = { current: null as never };
  function Probe() {
    result.current = useOAuthVerifyPlatformClaim();
    return null;
  }
  act(() => {
    TestRenderer.create(React.createElement(Probe));
  });
  return result;
}

async function submit() {
  const hook = renderHook();
  return act(() => hook.current.submit({ platform: X }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOpenAuthSession.mockResolvedValue({
    type: 'success',
    url: 'https://app/oauth/callback?state=STATE',
  });
});

describe('useOAuthVerifyPlatformClaim', () => {
  it('signs in, checks the token, publishes, then verifies', async () => {
    const ref = await submit();

    expect(mockOpenAuthSession).toHaveBeenCalledWith(
      'https://x.com/oauth',
      expect.stringContaining('/oauth/callback'),
    );
    // Everything stays on the server that issued the sign-in URL.
    expect(mockApi.getOAuthToken).toHaveBeenCalledWith(
      'http://bot',
      'x',
      'oauth-data',
    );
    expect(mockApi.checkOAuthClaim).toHaveBeenCalledWith(
      'http://bot',
      'x',
      [{ key: 0, value: 'me' }],
      't0k',
    );
    expect(mockCreateSubmit).toHaveBeenCalledWith({
      schema: expect.anything(),
      values: {
        platform: 'x',
        account: 'me',
        url: 'https://x.com/me',
      },
    });
    expect(mockApi.requestOAuthVerify).toHaveBeenCalledWith(
      'http://bot',
      'x',
      'claim-id',
      't0k',
    );
    expect(invalidateQuery).toHaveBeenCalledWith(mockClient, [
      'verification-verifies',
      'claim-id',
    ]);
    expect(ref.id).toBe('claim-id');
  });

  it('throws when the sign-in is cancelled', async () => {
    mockOpenAuthSession.mockResolvedValue({ type: 'cancel' });

    await expect(submit()).rejects.toThrow('Sign-in was cancelled');
    expect(mockCreateSubmit).not.toHaveBeenCalled();
  });

  it('creates nothing when the token check fails', async () => {
    mockApi.checkOAuthClaim.mockRejectedValueOnce(new Error('mismatch'));

    await expect(submit()).rejects.toThrow('mismatch');
    expect(mockCreateSubmit).not.toHaveBeenCalled();
    expect(mockDeleteClaim).not.toHaveBeenCalled();
  });

  it('rolls the claim back when verify fails after publishing', async () => {
    mockApi.requestOAuthVerify.mockRejectedValueOnce(new Error('server down'));

    await expect(submit()).rejects.toThrow('server down');
    expect(mockDeleteClaim).toHaveBeenCalledWith(mockClient, 'claim-id');
  });
});
