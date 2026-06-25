import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type ActiveFeed = 'posts' | 'likes';

interface ProfileContextValue {
  identityKey: string | null;
  isSelf: boolean;
  activeFeed: ActiveFeed;
  setActiveFeed: (tab: ActiveFeed) => void;
  // A WebFinger alias that has been verified to belong to this identity, when
  // the profile was reached via one. Null otherwise.
  webfingerAlias: string | null;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({
  identityKey,
  webfingerAlias = null,
  children,
}: {
  identityKey: string | null;
  webfingerAlias?: string | null;
  children: ReactNode;
}) {
  const { identity: selfIdentity } = useCurrentIdentity();
  const isSelf = !!identityKey && selfIdentity?.identityKey === identityKey;

  const [activeFeed, setActiveFeed] = useState<ActiveFeed>('posts');
  useEffect(() => {
    if (!isSelf) setActiveFeed('posts');
  }, [isSelf]);

  const value = useMemo<ProfileContextValue>(
    () => ({ identityKey, isSelf, activeFeed, setActiveFeed, webfingerAlias }),
    [identityKey, isSelf, activeFeed, webfingerAlias],
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
