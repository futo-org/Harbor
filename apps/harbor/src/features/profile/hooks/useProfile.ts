import { useMemo } from 'react';
import {
  FetchMode,
  Query,
  QueryData_Tags,
  type v2,
} from '@polycentric/react-native';
import { queryPayload } from '@/src/common/lib/polycentric-hooks/helpers';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import { decodeProfile, isProfileResponseEmpty } from '../lib/decodeProfile';

export interface ProfileHookResult {
  /**
   * Only for exceptions (page titles, moderation labels, the edit form).
   * Display names render through `Username` or `useUsername`.
   */
  name: string | null;
  description: string | null;
  avatar: v2.ImageSet | null;
  banner: v2.ImageSet | null;
  alias: string | null;
  followingCount: number;
  followersCount: number;
  isLoading: boolean;
  /**
   * False until a server has answered or the local store had profile events,
   * so an empty `name` is only meaningful once this is true.
   */
  isResolved: boolean;
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
  'isLoading' | 'isResolved' | 'error' | 'refresh'
> = {
  name: null,
  description: null,
  avatar: null,
  banner: null,
  alias: null,
  followingCount: 0,
  followersCount: 0,
};

/**
 * Shared cache key for a profile. The fetch mode is intentionally not part
 * of the key so every surface (feed avatars, post authors, the profile page)
 * reads and invalidates the same entry.
 */
export function profileQueryKey(
  identityKey: string | null | undefined,
): string[] {
  return ['profile', identityKey ?? ''];
}

export function useProfile(
  identityKey: string | null | undefined,
  options?: UseProfileOptions,
): ProfileHookResult {
  const fetchMode = options?.fetchMode ?? FetchMode.OfflineOnly;

  const query = useQuery(
    profileQueryKey(identityKey),
    new Query.GetProfile({ identity: identityKey ?? '' }),
    { fetchMode },
    !!identityKey,
  );

  const response = queryPayload(query.data, QueryData_Tags.Profile)?.response;
  const decoded = useMemo(
    () => (response ? decodeProfile(response) : EMPTY_PROFILE),
    [response],
  );

  return {
    name: decoded.name,
    description: decoded.description,
    avatar: decoded.avatar,
    banner: decoded.banner,
    alias: decoded.alias,
    followingCount: decoded.followingCount,
    followersCount: decoded.followersCount,
    isLoading: query.isLoading,
    // A local miss emits an empty response, indistinguishable by data alone.
    isResolved:
      query.successfulServers > 0 ||
      (!!response && !isProfileResponseEmpty(response)),
    error: query.error ? new Error(query.error) : null,
    refresh: () => query.refresh(RefreshStrategy.Fetch),
  };
}
