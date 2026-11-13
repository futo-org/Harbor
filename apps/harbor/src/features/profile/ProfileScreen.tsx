import { Text } from '@/src/common/components';
import { Screen } from '@/src/common/components/layout';
import { PagerViewWithHeader } from '@/src/common/components/PagerView';
import { Atoms, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { FeedPage } from '@/src/features/feed/FeedPage';
import { EMPTY_FEED } from '@/src/features/feed/hooks/types';
import { useIdentityFeed } from '@/src/features/feed/hooks/useIdentityFeed';
import { FetchMode } from '@polycentric/react-native';
import {
  router,
  useFocusEffect,
  useIsFocused,
  useLocalSearchParams,
} from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { type SharedValue, useSharedValue } from 'react-native-reanimated';
import useBlocks from '../block/hooks/useBlocks';
import { ProfileCompactHeader } from './ProfileCompactHeader';
import { ProfileHeader } from './ProfileHeader';
import { ProfileTabs } from './ProfileTabs';
import { normalizeAlias } from './alias/helpers';
import { useAliasResolutionStore } from './alias/useAliasResolutionStore';
import { useIdentityHandle } from './hooks/useIdentityHandle';
import { useProfile } from './hooks/useProfile';
import {
  type ActiveFeed,
  ProfileProvider,
  useProfileContext,
} from './ProfileContext';
import { ProfileVerificationsList } from './ProfileVerificationsList';
import { ProfileVerifiesList } from './ProfileVerifiesList';
import { usePageTitle } from '@/src/common/lib/navigation/usePageTitle';
import { truncateText } from '@/src/common/util/truncateText';
import { isIdentityKey } from '@/src/common/util/isIdentityKey';

/** Page order behind the profile's tab bar. */
const PROFILE_TABS: readonly ActiveFeed[] = [
  'posts',
  'verification-claims',
  'verification-verifies',
];

/** Clears the tab bar at the bottom of the screen. */
const FEED_PADDING = { paddingBottom: 40 };

const BLOCKED_PROFILE_MESSAGE =
  'You blocked this profile. Unblock to see their posts.';

export default function ProfileScreen({
  tab = 'posts',
}: {
  // Which tab's route rendered this screen.
  tab?: ActiveFeed;
}) {
  const { identityId } = useLocalSearchParams<{ identityId: string }>();

  if (!identityId || isIdentityKey(identityId)) {
    return (
      <ProfileProvider identityKey={identityId ?? null} activeFeed={tab}>
        <ProfileScreenContent />
      </ProfileProvider>
    );
  }

  // An alias (user@domain, or a bare domain) — resolve it to a key first.
  return <AliasProfile alias={identityId} tab={tab} />;
}

function ProfileScreenContent() {
  const { theme } = useTheme();
  const { identityKey, activeFeed, setActiveFeed } = useProfileContext();

  // The screen's one network fetch; the headers and tabs read the shared cache.
  const profile = useProfile(identityKey, { fetchMode: FetchMode.Default });
  const handle = useIdentityHandle(identityKey);
  usePageTitle(
    profile.name
      ? `${truncateText(profile.name, 30)} (${handle.text})`
      : handle.text,
  );

  const isFocused = useIsFocused();

  const isAbortedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      isAbortedRef.current = false;
      return () => {
        isAbortedRef.current = true;
      };
    }, []),
  );

  const isBlocked = useBlocks((s) => s.isBlocked(identityKey ?? ''));

  const identityFeed = useIdentityFeed(identityKey ?? undefined, undefined, {
    enabled: isFocused && activeFeed === 'posts' && !isBlocked,
    getIsAborted: () => isAbortedRef.current,
  });

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  // Stabilise the props for `memo(ProfileHeader)` — otherwise a fresh
  // array reference on every render defeats the memoisation.
  const bannerColors = useMemo<[string, string]>(
    () => [
      theme.palette.background_secondary,
      theme.palette.background_primary,
    ],
    [theme.palette.background_secondary, theme.palette.background_primary],
  );
  // Drive the compact header's take-over once the full header has passed.
  const scrollY = useSharedValue(0);
  const [headerHeight, setHeaderHeight] = useState(0);

  const renderHeader = useCallback(
    () => (
      <ProfileHeader
        bannerColors={bannerColors}
        onBack={handleBack}
        scrollY={scrollY}
      />
    ),
    [bannerColors, handleBack, scrollY],
  );

  const renderTabBar = useCallback(
    ({ dragProgress }: { dragProgress: SharedValue<number> }) => (
      <ProfileTabs progress={dragProgress} />
    ),
    [],
  );

  return (
    <Screen drawUnderStatusBar>
      <Screen.PrimaryColumn>
        <PagerViewWithHeader
          values={PROFILE_TABS}
          active={activeFeed}
          onChange={setActiveFeed}
          renderHeader={renderHeader}
          renderTabBar={renderTabBar}
          scrollY={scrollY}
          onHeaderHeightChange={setHeaderHeight}
        >
          <FeedPage
            feed={isBlocked ? EMPTY_FEED : identityFeed}
            active={activeFeed === 'posts'}
            emptyMessage={isBlocked ? BLOCKED_PROFILE_MESSAGE : undefined}
            contentContainerStyle={FEED_PADDING}
          />
          <ProfileVerificationsList
            active={activeFeed === 'verification-claims'}
          />
          <ProfileVerifiesList
            active={activeFeed === 'verification-verifies'}
          />
        </PagerViewWithHeader>

        {!isWeb ? (
          <ProfileCompactHeader
            scrollY={scrollY}
            headerHeight={headerHeight}
            onBack={handleBack}
          />
        ) : null}
      </Screen.PrimaryColumn>
    </Screen>
  );
}

/**
 * Resolve an alias (`user@domain`) to a polycentric identity, then render the
 * profile for it once that identity claims the alias back. The alias stays in
 * the URL; resolution happens in place rather than redirecting to the
 * canonical `/[identityId]`.
 */
function AliasProfile({ alias, tab }: { alias: string; tab: ActiveFeed }) {
  const normalizedAlias = normalizeAlias(alias);
  // Undefined while resolving, null when nothing was found.
  const candidate = useAliasResolutionStore((state) =>
    normalizedAlias ? state.identityByAlias[normalizedAlias] : null,
  );
  const resolveAlias = useAliasResolutionStore((state) => state.resolveAlias);

  useEffect(() => void resolveAlias(alias), [alias, resolveAlias]);

  // Fetches the candidate's profile, which the handle reads from the cache.
  useProfile(candidate ?? null, { fetchMode: FetchMode.Default });
  const handle = useIdentityHandle(candidate);

  if (candidate && handle.kind === 'alias' && handle.text === normalizedAlias) {
    return (
      <ProfileProvider
        identityKey={candidate}
        alias={normalizedAlias}
        activeFeed={tab}
      >
        <ProfileScreenContent />
      </ProfileProvider>
    );
  }

  // Still resolving the alias, or loading the profile it points at.
  if (candidate === undefined || (candidate && handle.kind === 'loading')) {
    return <AliasStatus message={`Verifying ${alias}…`} loading />;
  }

  return <AliasStatus message={`Couldn't verify ${alias}`} />;
}

function AliasStatus({
  message,
  loading,
}: {
  message: string;
  loading?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View
          style={[
            Atoms.flex_1,
            Atoms.items_center,
            Atoms.justify_center,
            Atoms.gap_md,
            Atoms.p_lg,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={theme.palette.primary_500} />
          ) : null}
          <Text variant="body" color="muted">
            {message}
          </Text>
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
