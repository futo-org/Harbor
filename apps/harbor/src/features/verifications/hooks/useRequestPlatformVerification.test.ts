const mockClient = { activeIdentityKey: 'me-key' };
jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  usePolycentric: () => mockClient,
}));

jest.mock('@/src/common/query/hooks/useQuery', () => ({
  invalidateQuery: jest.fn(),
}));

let mockVerifiers = new Map<string, Set<string>>();
const mockApi = {
  platformVerifiers: jest.fn(async () => mockVerifiers),
  requestTextVerify: jest.fn(async () => undefined),
  requestOAuthVerify: jest.fn(async () => undefined),
};
jest.mock('./useRequestVerification', () => ({
  publishVerifierBotTargets: jest.fn(async () => undefined),
}));

jest.mock('../utils/verifier-api', () => ({
  // Lazy: jest hoists this factory above the const.
  get verifierApi() {
    return mockApi;
  },
}));

const mockOAuthSignIn = jest.fn(async () => ({
  server: 'http://bot',
  username: 'me',
  token: 't0k',
}));
jest.mock('./useOAuthVerifyPlatformClaim', () => ({
  oauthSignIn: (...args: unknown[]) => mockOAuthSignIn(...(args as [])),
}));

import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import * as React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import type { Platform } from '../utils/platforms';
import useRequestPlatformVerification from './useRequestPlatformVerification';
import { publishVerifierBotTargets } from './useRequestVerification';

const mockPublishTargets = publishVerifierBotTargets as jest.Mock;

const GITHUB = { name: 'GitHub', slug: 'github' } as Platform;
const X = { name: 'X', slug: 'x' } as Platform;

type HookResult = ReturnType<typeof useRequestPlatformVerification>;

function renderHook(): { current: HookResult } {
  const result: { current: HookResult } = { current: null as never };
  function Probe() {
    result.current = useRequestPlatformVerification();
    return null;
  }
  act(() => {
    TestRenderer.create(React.createElement(Probe));
  });
  return result;
}

async function submit(platform: Platform) {
  const hook = renderHook();
  return act(() => hook.current.submit({ platform, claimId: 'claim-id' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifiers = new Map([
    ['github', new Set(['text'])],
    ['x', new Set(['oauth'])],
  ]);
});

describe('useRequestPlatformVerification', () => {
  it('re-checks the profile for text platforms', async () => {
    await submit(GITHUB);

    expect(mockApi.requestTextVerify).toHaveBeenCalledWith(
      'github',
      'claim-id',
    );
    // The request to the bots precedes their verify.
    expect(mockPublishTargets).toHaveBeenCalledWith(mockClient, 'claim-id');
    expect(mockPublishTargets.mock.invocationCallOrder[0]).toBeLessThan(
      mockApi.requestTextVerify.mock.invocationCallOrder[0],
    );
    expect(mockOAuthSignIn).not.toHaveBeenCalled();
    expect(invalidateQuery).toHaveBeenCalledWith(mockClient, [
      'verification-verifies',
      'claim-id',
    ]);
  });

  it('runs the sign-in again for oauth platforms', async () => {
    await submit(X);

    expect(mockOAuthSignIn).toHaveBeenCalledWith(X);
    expect(mockApi.requestOAuthVerify).toHaveBeenCalledWith(
      'http://bot',
      'x',
      'claim-id',
      't0k',
    );
    expect(mockApi.requestTextVerify).not.toHaveBeenCalled();
  });

  it('prefers text when a platform has both', async () => {
    mockVerifiers.set('github', new Set(['text', 'oauth']));
    await submit(GITHUB);

    expect(mockApi.requestTextVerify).toHaveBeenCalled();
    expect(mockOAuthSignIn).not.toHaveBeenCalled();
  });

  it('throws for platforms no server verifies', async () => {
    await expect(
      submit({ name: 'MySpace', slug: 'myspace' } as Platform),
    ).rejects.toThrow('No verifier available for MySpace');
  });
});
