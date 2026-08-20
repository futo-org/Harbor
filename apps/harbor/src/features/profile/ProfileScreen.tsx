import { Text } from '@/src/common/components';
import { Screen } from '@/src/common/components/layout';
import { PagerViewWithHeader } from '@/src/common/components/PagerView';
import { Routes } from '@/src/common/constants/routes';
import { Atoms, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { replacePath } from '@/src/common/lib/navigation/replacePath';
import { FeedPage } from '@/src/features/feed/FeedPage';
import { useIdentityFeed } from '@/src/features/feed/hooks/useIdentityFeed';
import {
  FetchMode,
  isIdentityKey,
  normalizeAlias,
  resolveAlias,
} from '@polycentric/react-native';
import {
  router,
  useFocusEffect,
  useIsFocused,
  useLocalSearchParams,
} from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { ProfileCompactHeader } from './ProfileCompactHeader';
import { ProfileHeader } from './ProfileHeader';
import { ProfileTabs } from './ProfileTabs';
import { useProfile } from './hooks/useProfile';
import {
  getVerifiedAlias,
  getVerifiedIdentity,
  recordVerifiedAlias,
} from './lib/aliasVerificationCache';
import {
  type ActiveFeed,
  ProfileProvider,
  useProfileContext,
} from './ProfileContext';
import { ProfileVerificationsList } from './ProfileVerificationsList';
import { ProfileVerifiesList } from './ProfileVerifiesList';
import { usePageTitle } from '@/src/common/lib/navigation/usePageTitle';
import { shortenIdentityId } from '@/src/common/lib/polycentric-hooks/helpers';
import { truncateText } from '@/src/common/util/truncateText';

/** Page order behind the profile's tab bar. */
const PROFILE_TABS: readonly ActiveFeed[] = [
  'posts',
  'verification-claims',
  'verification-verifies',
];

/** Clears the tab bar at the bottom of the screen. */
const FEED_PADDING = { paddingBottom: 40 };

export default function ProfileScreen({
  tab = 'posts',
}: {
  // Which tab's route rendered this screen.
  tab?: ActiveFeed;
}) {
  const { identityId } = useLocalSearchParams<{ identityId: string }>();

  if (!identityId || isIdentityKey(identityId)) {
    return <IdentityProfile identityKey={identityId ?? null} tab={tab} />;
  }

  // An alias (user@domain, or a bare domain) — resolve it to a key first.
  return <AliasProfile alias={identityId} tab={tab} />;
}

/**
 * Render a profile addressed by its identity key. If that profile claims an
 * alias that *verifiably* resolves back to this same identity,
 * redirect to the canonical alias URL (`/user@domain`).
 *
 * Verification happens before the redirect: `resolveAlias(alias)` must
 * return this exact identity, so a profile can't bounce us to an alias it
 * doesn't actually own. The alias URL renders `AliasProfile` (not this
 * component), so there's no redirect loop.
 */
function IdentityProfile({
  identityKey,
  tab,
}: {
  identityKey: string | null;
  tab: ActiveFeed;
}) {
  const profile = useProfile(identityKey, { fetchMode: FetchMode.Default });

  const [verifiedAlias, setVerifiedAlias] = useState<string | null>(() =>
    identityKey ? getVerifiedAlias(identityKey) : null,
  );
  useEffect(() => {
    setVerifiedAlias(identityKey ? getVerifiedAlias(identityKey) : null);
  }, [identityKey]);

  useEffect(() => {
    if (!identityKey || verifiedAlias) return;
    if (profile.isLoading) return;
    const alias = profile.alias;
    if (!alias) return;

    let cancelled = false;
    void resolveAlias(alias).then((resolved) => {
      if (cancelled || !resolved) return;
      // Only accept an alias that points back to THIS identity.
      if (resolved.toLowerCase() === identityKey.toLowerCase()) {
        const canonical = normalizeAlias(alias);
        if (!canonical) return;
        recordVerifiedAlias(alias, identityKey);
        setVerifiedAlias(canonical);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [identityKey, verifiedAlias, profile.isLoading, profile.alias]);

  // The address bar shows the canonical alias URL. Rewritten in place —
  // navigating would remount the profile as `AliasProfile`, a visible flash.
  useEffect(() => {
    if (!verifiedAlias) return;
    replacePath(
      tab === 'verification-claims'
        ? Routes.tabs.profileVerificationClaims(verifiedAlias)
        : tab === 'verification-verifies'
          ? Routes.tabs.profileVerificationVerifies(verifiedAlias)
          : Routes.tabs.profile(verifiedAlias),
    );
  }, [verifiedAlias, tab]);

  return (
    <ProfileProvider
      identityKey={identityKey}
      alias={verifiedAlias}
      activeFeed={tab}
    >
      <ProfileScreenContent />
    </ProfileProvider>
  );
}

function ProfileScreenContent() {
  const { theme } = useTheme();
  const { identityKey, activeFeed, setActiveFeed } = useProfileContext();

  // Reads the profile query the header already shares.
  const profile = useProfile(identityKey);
  const shortId = shortenIdentityId(identityKey ?? undefined);
  usePageTitle(
    profile.name ? `${truncateText(profile.name, 30)} (${shortId})` : shortId,
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

  const identityFeed = useIdentityFeed(identityKey ?? undefined, undefined, {
    enabled: isFocused && activeFeed === 'posts',
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
    () => <ProfileHeader bannerColors={bannerColors} onBack={handleBack} />,
    [bannerColors, handleBack],
  );

  const renderTabBar = useCallback(
    ({ dragProgress }: { dragProgress: SharedValue<number> }) => (
      <ProfileTabs progress={dragProgress} />
    ),
    [],
  );

  return (
    <Screen>
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
            feed={identityFeed}
            active={activeFeed === 'posts'}
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

type AliasResolution =
  | { status: 'loading' }
  // Resolved to a candidate identity, now confirming it claims `alias` back.
  | { status: 'verifying'; identity: string }
  // Candidate confirmed; render its profile.
  | { status: 'verified'; identity: string }
  | { status: 'unverified' }
  | { status: 'not-found' };

/**
 * Resolve an alias (`user@domain`) to a polycentric identity, then
 * render the profile for it. The alias stays in the URL; resolution happens
 * in place rather than redirecting to the canonical `/[identityId]`.
 */
function AliasProfile({ alias, tab }: { alias: string; tab: ActiveFeed }) {
  const [resolution, setResolution] = useState<AliasResolution>({
    status: 'loading',
  });

  useEffect(() => {
    // Fast path: skip the resolve + profile round-trip when this alias was
    // already verified this session.
    const cachedIdentity = getVerifiedIdentity(alias);
    if (cachedIdentity) {
      setResolution({ status: 'verified', identity: cachedIdentity });
      return;
    }

    let cancelled = false;
    setResolution({ status: 'loading' });
    // resolveAlias resolves to null on any failure (it never rejects); the
    // catch is defensive so the loading state can't wedge.
    void resolveAlias(alias)
      .then((result) => {
        if (cancelled) return;
        setResolution(
          result
            ? { status: 'verifying', identity: result }
            : { status: 'not-found' },
        );
      })
      .catch(() => {
        if (!cancelled) setResolution({ status: 'not-found' });
      });
    return () => {
      cancelled = true;
    };
  }, [alias]);

  // Load the candidate's profile to read the alias it claims for itself.
  const candidate =
    resolution.status === 'verifying' ? resolution.identity : null;
  const profile = useProfile(candidate, { fetchMode: FetchMode.Default });

  // Latch the verdict exactly once, when the candidate's profile first loads.
  useEffect(() => {
    if (resolution.status !== 'verifying' || profile.isLoading) return;
    // Both sides go through the same canonicaliser so a leading `@` or
    // differing case can't cause a false mismatch; a null on either side
    // fails closed.
    const expected = normalizeAlias(alias);
    const claimed = profile.alias ? normalizeAlias(profile.alias) : null;
    const verified = !!expected && claimed === expected;
    if (verified) {
      recordVerifiedAlias(alias, resolution.identity);
    }
    setResolution(
      verified
        ? { status: 'verified', identity: resolution.identity }
        : { status: 'unverified' },
    );
  }, [resolution, profile.isLoading, profile.alias, alias]);

  switch (resolution.status) {
    case 'loading':
      return <AliasStatus message={`Resolving ${alias}…`} loading />;
    case 'verifying':
      return <AliasStatus message={`Verifying ${alias}…`} loading />;
    case 'not-found':
      return <AliasStatus message={`Couldn't find ${alias}`} />;
    case 'unverified':
      return <AliasStatus message={`Couldn't verify ${alias}`} />;
    case 'verified':
      return (
        <ProfileProvider
          identityKey={resolution.identity}
          alias={normalizeAlias(alias) ?? alias}
          activeFeed={tab}
        >
          <ProfileScreenContent />
        </ProfileProvider>
      );
  }
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
          <Text variant="body" color="neutral_500">
            {message}
          </Text>
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
