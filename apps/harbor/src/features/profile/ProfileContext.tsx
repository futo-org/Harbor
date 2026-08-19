import { Routes } from '@/src/common/constants';
import { replacePath } from '@/src/common/lib/navigation/replacePath';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
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
  activeFeed: initialFeed = 'posts',
  children,
}: {
  identityKey: string | null;
  alias?: string | null;
  // Which tab's route rendered this profile; the page it opens on.
  activeFeed?: ActiveFeed;
  children: ReactNode;
}) {
  const { identity: selfIdentity } = useCurrentIdentity();
  const isSelf = !!identityKey && selfIdentity?.identityKey === identityKey;

  // The tabs are pages of one `PagerView`, so the profile stays mounted across
  // them. The route only picks which one opens.
  const [activeFeed, setActiveFeed] = useState<ActiveFeed>(initialFeed);

  const selectFeed = useCallback(
    (tab: ActiveFeed) => {
      setActiveFeed(tab);

      const target = alias ?? identityKey;
      if (!target) return;
      replacePath(
        tab === 'verifications'
          ? Routes.tabs.profileVerifications(target)
          : Routes.tabs.profile(target),
      );
    },
    [alias, identityKey],
  );

  const value = useMemo<ProfileContextValue>(
    () => ({
      identityKey,
      isSelf,
      activeFeed,
      setActiveFeed: selectFeed,
      alias,
    }),
    [identityKey, isSelf, activeFeed, selectFeed, alias],
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
