import { useMemo } from 'react';
import { FetchMode, Query, v2 } from '@polycentric/react-native';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import { decodeProfile } from '../lib/decodeProfile';

export interface ProfileHookResult {
  name: string | null;
  description: string | null;
  avatar: v2.ImageSet | null;
  banner: v2.ImageSet | null;
  alias: string | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

export interface UseProfileOptions {
  /**
   * Defaults to `OfflineOnly` (will not fetch unless its found in caches)
   */
  fetchMode?: FetchMode;
}

const EMPTY_PROFILE: Omit<
  ProfileHookResult,
  'isLoading' | 'error' | 'refresh'
> = {
  name: null,
  description: null,
  avatar: null,
  banner: null,
  alias: null,
};

export function useProfile(
  identityKey: string | null | undefined,
  options?: UseProfileOptions,
): ProfileHookResult {
  const fetchMode = options?.fetchMode ?? FetchMode.OfflineOnly;

  const query = useQuery(
    ['profile', identityKey ?? '', fetchMode.toString()],
    new Query.GetProfile({ identity: identityKey ?? '' }),
    { fetchMode },
    !!identityKey,
  );

  const decoded = useMemo(() => {
    if (!query.data) return EMPTY_PROFILE;
    return decodeProfile(query.data);
  }, [query.data]);

  return {
    name: decoded.name,
    description: decoded.description,
    avatar: decoded.avatar,
    banner: decoded.banner,
    alias: decoded.alias,
    isLoading: query.isLoading,
    error: query.error ? new Error(query.error) : null,
    refresh: () => query.refresh(RefreshStrategy.Fetch),
  };
}
