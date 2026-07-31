import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { useNavigation } from 'expo-router';
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

  const navigation = useNavigation();

  // Tabs are sibling routes inside the profile's hidden tab navigator
  // (`app/[identityId]/(profile)`). Jump between them directly — going
  // through `router.replace(href)` resolves at the stack level, which
  // remounts the whole profile with a push transition instead of
  // switching tabs in place. Expo-router keeps the URL in sync with the
  // resulting navigation state.
  const setActiveFeed = useCallback(
    (tab: ActiveFeed) => {
      if (tab === activeFeed) return;
      navigation.dispatch({
        type: 'JUMP_TO',
        payload: {
          name: tab === 'verifications' ? 'verifications' : 'index',
          params: { identityId: alias ?? identityKey },
        },
      });
    },
    [activeFeed, alias, identityKey, navigation],
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
