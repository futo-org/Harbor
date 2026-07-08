import { Routes } from '@/src/common/constants/routes';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { router } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

export type ActiveFeed = 'posts' | 'verifications';

interface ProfileContextValue {
  identityKey: string | null;
  isSelf: boolean;
  activeFeed: ActiveFeed;
  setActiveFeed: (tab: ActiveFeed) => void;
  // An alias that has been verified to belong to this identity, when
  // the profile was reached via one. Null otherwise.
  alias: string | null;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({
  identityKey,
  alias = null,
  activeFeed = 'posts',
  children,
}: {
  identityKey: string | null;
  alias?: string | null;
  // Which tab's route rendered this profile.
  activeFeed?: ActiveFeed;
  children: ReactNode;
}) {
  const { identity: selfIdentity } = useCurrentIdentity();
  const isSelf = !!identityKey && selfIdentity?.identityKey === identityKey;

  // Tabs are routes; switching replaces the URL, keeping the alias when
  // the profile was reached via one.
  const setActiveFeed = useCallback(
    (tab: ActiveFeed) => {
      const profileId = alias ?? identityKey;
      if (tab === activeFeed || !profileId) return;
      router.replace(
        tab === 'verifications'
          ? Routes.tabs.profileVerifications(profileId)
          : Routes.tabs.profile(profileId),
      );
    },
    [activeFeed, alias, identityKey],
  );

  const value = useMemo<ProfileContextValue>(
    () => ({ identityKey, isSelf, activeFeed, setActiveFeed, alias }),
    [identityKey, isSelf, activeFeed, setActiveFeed, alias],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfileContext(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx)
    throw new Error('useProfileContext must be used within ProfileProvider');
  return ctx;
}
