jest.mock('@polycentric/react-native', () => ({
  resolveAlias: jest.fn(),
}));
jest.mock('@/src/common/query/hooks/useQuery', () => ({
  invalidateQuery: jest.fn(),
}));
jest.mock('../../../common/lib/polycentric-hooks/PolycentricProvider', () => ({
  usePolycentric: () => ({}),
}));
jest.mock('../lib/publishProfileUpdate', () => ({
  publishProfileUpdate: jest.fn().mockResolvedValue(undefined),
}));

import { act, renderHook } from '@testing-library/react-native';
import { resolveAlias } from '@polycentric/react-native';
import { useProfileEdit } from './useProfileEdit';
import { publishProfileUpdate } from '../lib/publishProfileUpdate';

const mockResolve = resolveAlias as jest.Mock;
const mockPublish = publishProfileUpdate as jest.Mock;

const IDENTITY =
  '0a2abecb223dbd572729018f8d201f32471e2a5b71e2032c052f6830846c4722';
const OTHER =
  'f00df0262908a197391c4cbc619eb11cb6867c90915b6e23a3db7a061def8fc3';

const makeProfile = (alias: string | null = 'me@domain.com') => ({
  description: 'bio',
  alias,
  avatar: null,
  banner: null,
  refresh: jest.fn(),
});

// Render the hook and edit the alias draft to `next`, simulating user input.
async function editAlias(profileAlias: string | null, next: string) {
  const hook = await renderHook(() =>
    useProfileEdit('Alice', makeProfile(profileAlias), IDENTITY),
  );
  await act(async () => hook.result.current.setAliasDraft(next));
  return hook.result;
}

beforeEach(() => jest.clearAllMocks());

describe('useProfileEdit alias', () => {
  it('seeds the alias draft from the profile', async () => {
    const { result } = await renderHook(() =>
      useProfileEdit('Alice', makeProfile(), IDENTITY),
    );
    expect(result.current.aliasDraft).toBe('me@domain.com');
  });

  it('resets an edited alias draft on cancel', async () => {
    const { result } = await renderHook(() =>
      useProfileEdit('Alice', makeProfile(), IDENTITY),
    );
    await act(async () => result.current.setAliasDraft('changed@x.com'));
    expect(result.current.aliasDraft).toBe('changed@x.com');
    await act(async () => result.current.handleCancel());
    expect(result.current.aliasDraft).toBe('me@domain.com');
  });

  it('skips verification entirely when the alias is unchanged', async () => {
    const { result } = await renderHook(() =>
      useProfileEdit('Alice', makeProfile('me@domain.com'), IDENTITY),
    );

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.handleSave();
    });

    expect(ok).toBe(true);
    expect(mockResolve).not.toHaveBeenCalled();
    expect(mockPublish).toHaveBeenCalled();
    expect(result.current.aliasError).toBeNull();
  });

  it('verifies and commits when an edited alias resolves back to this identity', async () => {
    mockResolve.mockResolvedValue(IDENTITY);
    const result = await editAlias(null, 'new@domain.com');

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.handleSave();
    });

    expect(ok).toBe(true);
    expect(mockResolve).toHaveBeenCalledWith('new@domain.com');
    expect(mockPublish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ alias: 'new@domain.com' }),
    );
    expect(result.current.aliasError).toBeNull();
  });

  it('rejects an edited alias that points at a different identity', async () => {
    mockResolve.mockResolvedValue(OTHER);
    const result = await editAlias(null, 'new@domain.com');

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.handleSave();
    });

    expect(ok).toBe(false);
    expect(mockPublish).not.toHaveBeenCalled();
    expect(result.current.aliasError).not.toBeNull();
  });

  it('rejects an edited alias that does not resolve at all', async () => {
    mockResolve.mockResolvedValue(null);
    const result = await editAlias(null, 'new@domain.com');

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.handleSave();
    });

    expect(ok).toBe(false);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('commits a cleared alias without verifying', async () => {
    const result = await editAlias('me@domain.com', '');

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.handleSave();
    });

    expect(ok).toBe(true);
    expect(mockResolve).not.toHaveBeenCalled();
    expect(mockPublish).toHaveBeenCalled();
  });
});
