jest.mock('@polycentric/react-native', () => ({
  FetchMode: { OfflineOnly: 'OfflineOnly', Default: 'Default' },
  Query: {
    GetProfile: class {
      constructor(_args: unknown) {}
    },
  },
  v2: {},
}));
jest.mock('@/src/common/query/hooks/useQuery', () => ({ useQuery: jest.fn() }));
jest.mock('../lib/decodeProfile', () => ({ decodeProfile: jest.fn() }));

import { renderHook } from '@testing-library/react-native';
import { useProfile } from './useProfile';
import { useQuery } from '@/src/common/query/hooks/useQuery';
import { decodeProfile } from '../lib/decodeProfile';

const mockUseQuery = useQuery as jest.Mock;
const mockDecode = decodeProfile as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('useProfile', () => {
  it('surfaces alias decoded from the query data', async () => {
    mockUseQuery.mockReturnValue({
      data: new Uint8Array([1]),
      isLoading: false,
      error: null,
      invalidate: jest.fn(),
    });
    mockDecode.mockReturnValue({
      name: 'Alice',
      description: null,
      avatar: null,
      banner: null,
      alias: 'alice@domain.com',
    });

    const { result } = await renderHook(() =>
      useProfile('id', { fetchMode: 'Default' as never }),
    );

    expect(result.current.alias).toBe('alice@domain.com');
  });

  it('returns a null alias (and skips decode) when there is no data', async () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      invalidate: jest.fn(),
    });

    const { result } = await renderHook(() => useProfile('id'));

    expect(result.current.alias).toBeNull();
    expect(result.current.isLoading).toBe(true);
    expect(mockDecode).not.toHaveBeenCalled();
  });
});

describe('useProfile follow counters', () => {
  it('passes the decoded counters through', async () => {
    mockUseQuery.mockReturnValue({
      data: new Uint8Array([1]),
      isLoading: false,
      error: null,
      invalidate: jest.fn(),
    });
    mockDecode.mockReturnValue({
      name: 'Alice',
      description: null,
      avatar: null,
      banner: null,
      alias: null,
      followingCount: 3,
      followersCount: 7,
    });

    const { result } = await renderHook(() => useProfile('id'));

    expect(result.current.followingCount).toBe(3);
    expect(result.current.followersCount).toBe(7);
  });

  it('reports zero counters when there is no data', async () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      invalidate: jest.fn(),
    });

    const { result } = await renderHook(() => useProfile('id'));

    expect(result.current.followingCount).toBe(0);
    expect(result.current.followersCount).toBe(0);
  });
});
