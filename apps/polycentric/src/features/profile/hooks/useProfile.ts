import { useCallback, useEffect } from 'react';
import { FetchMode, v2 } from '@polycentric/react-native';
import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import useProfiles, { emptyProfile } from './useProfiles';

export interface ProfileHookResult {
  name: string | null;
  description: string | null;
  avatar: v2.ImageSet | null;
  banner: v2.ImageSet | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

export interface UseProfileOptions {
  /**
   * Defaults to  `OfflineOnly` (will not fetch unless its found in caches)
   */
  fetchMode?: FetchMode;
}

export function useProfile(
  identityKey: string | null | undefined,
  options?: UseProfileOptions,
): ProfileHookResult {
  const client = usePolycentric();
  const fetchMode = options?.fetchMode ?? FetchMode.OfflineOnly;
  const profile = useProfiles((s) =>
    identityKey ? s.profiles.get(identityKey) : undefined,
  );

  useEffect(() => {
    if (!identityKey) return;
    useProfiles.getState().fetch(client, identityKey, fetchMode);
  }, [client, identityKey, fetchMode]);

  const refresh = useCallback(() => {
    if (!identityKey) return;
    useProfiles.getState().refresh(client, identityKey);
  }, [client, identityKey]);

  const data = profile ?? emptyProfile(identityKey ?? '');

  return {
    name: data.name,
    description: data.description,
    avatar: data.avatar,
    banner: data.banner,
    isLoading: data.isLoading,
    error: data.error,
    refresh,
  };
}
