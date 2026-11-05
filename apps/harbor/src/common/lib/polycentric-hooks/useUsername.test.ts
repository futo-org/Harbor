// The provider's other imports reach native uniffi init and rs-core queries,
// which can't run under jest.
jest.mock('@polycentric/react-native', () => ({
  FetchMode: { OfflineFirst: 'OfflineFirst' },
}));
jest.mock('@/src/features/block/hooks/useBlocks', () => jest.fn());
jest.mock('@/src/features/follow/hooks/useFollows', () => jest.fn());
jest.mock('@/src/features/post/hooks/useReposts', () => jest.fn());
jest.mock('@/src/features/reaction/useReactions', () => jest.fn());
jest.mock('@/src/features/profile/hooks/useProfile', () => ({
  useProfile: jest.fn(),
}));

import { renderHook } from '@testing-library/react-native';
import { DEFAULT_IDENTITY_NAME } from '@/src/common/constants';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { useUsername } from './PolycentricProvider';

const mockUseProfile = useProfile as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('useUsername', () => {
  it('shows a placeholder while the profile loads', async () => {
    mockUseProfile.mockReturnValue({ name: null, isLoading: true });

    const { result } = await renderHook(() => useUsername('id'));

    expect(result.current).toBe('…');
  });

  it('falls back to the default name for a loaded profile without a name', async () => {
    mockUseProfile.mockReturnValue({ name: null, isLoading: false });

    const { result } = await renderHook(() => useUsername('id'));

    expect(result.current).toBe(DEFAULT_IDENTITY_NAME);
  });
});
