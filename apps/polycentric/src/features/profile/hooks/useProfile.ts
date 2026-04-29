import { useCallback, useEffect } from 'react';
import { v2 } from '@polycentric/react-native';
import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import useProfiles, { emptyProfile } from './useProfiles';

export interface ProfileHookResult {
  name: string | null;
  description: string | null;
  avatar: v2.Image | null;
  banner: v2.Image | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useProfile(
  identityKey: string | null | undefined,
): ProfileHookResult {
  const client = usePolycentric();
  const profile = useProfiles((s) =>
    identityKey ? s.profiles.get(identityKey) : undefined,
  );

  useEffect(() => {
    if (!identityKey) return;
    void useProfiles.getState().fetchProfile(client, identityKey);
  }, [client, identityKey]);

  const refresh = useCallback(() => {
    if (!identityKey) return;
    void useProfiles.getState().fetchProfile(client, identityKey, true);
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
