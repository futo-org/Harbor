jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  shortenIdentityId: (identity: string) => identity.slice(0, 10),
}));
jest.mock('./useProfile', () => ({ useProfile: jest.fn() }));

import { renderHook, waitFor } from '@testing-library/react-native';
import { useAliasResolutionStore } from '../alias/useAliasResolutionStore';
import { useIdentityHandle } from './useIdentityHandle';
import { useProfile } from './useProfile';

const mockUseProfile = useProfile as jest.Mock;

const ALICE = 'aa11'.repeat(16);
const BOB = 'bb22'.repeat(16);

let fetchMock: jest.Mock;

beforeEach(() => {
  useAliasResolutionStore.setState({
    identityByAlias: {},
    identityPromiseByAlias: {},
  });
  fetchMock = jest.fn();
  global.fetch = fetchMock;
});

describe('useIdentityHandle', () => {
  it('is loading while the profile loads', async () => {
    mockProfile({ alias: null, isLoading: true, isResolved: false });

    const { result } = await renderHook(() => useIdentityHandle(ALICE));
    expect(result.current).toEqual({ kind: 'loading', text: '…' });
  });

  it('is loading without an identity', async () => {
    mockProfile({ alias: null, isLoading: false, isResolved: false });

    const { result } = await renderHook(() => useIdentityHandle(null));
    expect(result.current).toEqual({ kind: 'loading', text: '…' });
  });

  it('shows the shortened id when the profile claims no alias', async () => {
    mockProfile({ alias: null });

    const { result } = await renderHook(() => useIdentityHandle(ALICE));
    expect(result.current).toEqual({ kind: 'hash', text: 'aa11aa11aa' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the claimed alias as pending while it resolves', async () => {
    mockProfile({ alias: 'Pending@Example.com' });
    let resolveFetch: (response: unknown) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise((resolve) => (resolveFetch = resolve)),
    );

    const { result } = await renderHook(() => useIdentityHandle(ALICE));
    expect(result.current).toEqual({
      kind: 'alias-pending',
      text: 'pending@example.com',
    });

    // Settle the request so its timeout timer doesn't outlive the test.
    resolveFetch(jsonResponse({ pending: ALICE }));
    await waitFor(() => expect(result.current.kind).toBe('alias'));
  });

  it('shows the alias once it resolves back to the identity', async () => {
    mockProfile({ alias: 'verified@example.com' });
    fetchMock.mockResolvedValue(jsonResponse({ verified: ALICE }));

    const { result } = await renderHook(() => useIdentityHandle(ALICE));
    await waitFor(() =>
      expect(result.current).toEqual({
        kind: 'alias',
        text: 'verified@example.com',
      }),
    );

    // Already resolved: a new render starts verified, with no new request.
    const second = await renderHook(() => useIdentityHandle(ALICE));
    expect(second.result.current.kind).toBe('alias');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows the shortened id when the alias resolves to someone else', async () => {
    mockProfile({ alias: 'impostor@example.com' });
    fetchMock.mockResolvedValue(jsonResponse({ impostor: BOB }));

    const { result } = await renderHook(() => useIdentityHandle(ALICE));
    await waitFor(() =>
      expect(result.current).toEqual({ kind: 'hash', text: 'aa11aa11aa' }),
    );
  });

  it('shows the shortened id when the alias does not resolve', async () => {
    mockProfile({ alias: 'missing@example.com' });
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });

    const { result } = await renderHook(() => useIdentityHandle(ALICE));
    await waitFor(() =>
      expect(result.current).toEqual({ kind: 'hash', text: 'aa11aa11aa' }),
    );
  });

  it('shows the shortened id when the claimed alias is malformed', async () => {
    mockProfile({ alias: 'not an alias' });

    const { result } = await renderHook(() => useIdentityHandle(ALICE));
    expect(result.current).toEqual({ kind: 'hash', text: 'aa11aa11aa' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function mockProfile(profile: {
  alias: string | null;
  isLoading?: boolean;
  isResolved?: boolean;
}) {
  mockUseProfile.mockReturnValue({
    isLoading: false,
    isResolved: true,
    ...profile,
  });
}

function jsonResponse(names: Record<string, string>) {
  return { ok: true, json: async () => ({ names }) };
}
