import { Text } from '@/src/common/components';
import { Screen } from '@/src/common/components/layout';
import { Atoms, useTheme } from '@/src/common/theme';
import { useIdentityFeed } from '@/src/features/feed/hooks/useIdentityFeed';
import { useLikesFeed } from '@/src/features/feed/hooks/useLikesFeed';
import {
  FetchMode,
  normalizeWebFingerHandle,
  resolveWebFinger,
} from '@polycentric/react-native';
import {
  router,
  useFocusEffect,
  useIsFocused,
  useLocalSearchParams,
} from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ProfileHeader } from './ProfileHeader';
import { useProfile } from './hooks/useProfile';
import {
  getVerifiedAlias,
  getVerifiedIdentity,
  recordVerifiedAlias,
} from './lib/webfingerVerificationCache';
import { ProfileProvider, useProfileContext } from './ProfileContext';
import { ProfileFeedSwitcher } from './ProfileFeedSwitcher';
import { useFocusedRefresh } from '@/src/common/lib/navigation/useFocusedRefresh';

export default function ProfileScreen() {
  const { identityId } = useLocalSearchParams<{ identityId: string }>();

  // A WebFinger handle (user@domain) rather than a polycentric identity key —
  // resolve it to a key first.
  if (identityId?.includes('@')) {
    return <WebFingerProfile handle={identityId} />;
  }

  return <IdentityProfile identityKey={identityId ?? null} />;
}

/**
 * Render a profile addressed by its identity key. If that profile claims a
 * WebFinger alias that *verifiably* resolves back to this same identity,
 * redirect to the canonical alias URL (`/user@domain`).
 *
 * Verification happens before the redirect: `resolveWebFinger(alias)` must
 * return this exact identity, so a profile can't bounce us to an alias it
 * doesn't actually own. The alias URL renders `WebFingerProfile` (not this
 * component), so there's no redirect loop.
 */
function IdentityProfile({ identityKey }: { identityKey: string | null }) {
  const profile = useProfile(identityKey, { fetchMode: FetchMode.Default });

  // Redirect at most once per identity, even though the shared profile query
  // may briefly re-enter its loading state and re-run this effect.
  const redirectedRef = useRef(false);
  useEffect(() => {
    redirectedRef.current = false;
  }, [identityKey]);

  useEffect(() => {
    if (!identityKey || redirectedRef.current) return;

    // Fast path: a relationship verified earlier this session redirects
    // without waiting for the profile to load or hitting the network.
    const cachedAlias = getVerifiedAlias(identityKey);
    if (cachedAlias) {
      redirectedRef.current = true;
      router.replace({
        pathname: '/[identityId]',
        params: { identityId: cachedAlias },
      });
      return;
    }

    if (profile.isLoading) return;
    const alias = profile.webfingerAlias;
    if (!alias) return;

    let cancelled = false;
    void resolveWebFinger(alias).then((resolved) => {
      if (cancelled || redirectedRef.current || !resolved) return;
      // Only redirect when the alias points back to THIS identity.
      if (resolved.toLowerCase() === identityKey.toLowerCase()) {
        recordVerifiedAlias(alias, identityKey);
        redirectedRef.current = true;
        router.replace({
          pathname: '/[identityId]',
          params: { identityId: alias },
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [identityKey, profile.isLoading, profile.webfingerAlias]);

  return (
    <ProfileProvider identityKey={identityKey}>
      <ProfileScreenContent />
    </ProfileProvider>
  );
}

function ProfileScreenContent() {
  const { theme } = useTheme();
  const { identityKey, isSelf, activeFeed } = useProfileContext();

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
    enabled: isFocused,
    getIsAborted: () => isAbortedRef.current,
  });
  const likesFeed = useLikesFeed({
    enabled: isSelf && isFocused,
    getIsAborted: () => isAbortedRef.current,
  });

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  const refresh = useCallback(() => {
    identityFeed.refresh();
    likesFeed.refresh();
  }, [identityFeed.refresh, likesFeed.refresh]);
  useFocusedRefresh(refresh);

  // Stabilise the props for `memo(ProfileHeader)` — otherwise a fresh
  // array reference on every render defeats the memoisation.
  const bannerColors = useMemo<[string, string]>(
    () => [
      theme.palette.background_secondary,
      theme.palette.background_primary,
    ],
    [theme.palette.background_secondary, theme.palette.background_primary],
  );
  const profileHeader = useMemo(
    () => <ProfileHeader bannerColors={bannerColors} onBack={handleBack} />,
    [bannerColors, handleBack],
  );

  const tabs = useMemo(
    () =>
      isSelf
        ? [
            { key: 'posts', feed: identityFeed, bottomPadding: 40 },
            { key: 'likes', feed: likesFeed, bottomPadding: 40 },
          ]
        : [{ key: 'posts', feed: identityFeed, bottomPadding: 40 }],
    [isSelf, identityFeed, likesFeed],
  );

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <ProfileFeedSwitcher
          tabs={tabs}
          activeKey={activeFeed}
          HeaderComponent={profileHeader}
        />
      </Screen.PrimaryColumn>
    </Screen>
  );
}

type WebFingerResolution =
  | { status: 'loading' }
  // Resolved to a candidate identity, now confirming it claims `handle` back.
  | { status: 'verifying'; identity: string }
  // Candidate confirmed; render its profile.
  | { status: 'verified'; identity: string }
  | { status: 'unverified' }
  | { status: 'not-found' };

/**
 * Resolve a WebFinger handle (`user@domain`) to a polycentric identity, then
 * render the profile for it. The handle stays in the URL; resolution happens
 * in place rather than redirecting to the canonical `/[identityId]`.
 */
function WebFingerProfile({ handle }: { handle: string }) {
  const [resolution, setResolution] = useState<WebFingerResolution>({
    status: 'loading',
  });

  useEffect(() => {
    // Fast path: skip the resolve + profile round-trip when this handle was
    // already verified this session.
    const cachedIdentity = getVerifiedIdentity(handle);
    if (cachedIdentity) {
      setResolution({ status: 'verified', identity: cachedIdentity });
      return;
    }

    let cancelled = false;
    setResolution({ status: 'loading' });
    // resolveWebFinger resolves to null on any failure (it never rejects); the
    // catch is defensive so the loading state can't wedge.
    void resolveWebFinger(handle)
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
  }, [handle]);

  // Load the candidate's profile to read the alias it claims for itself.
  // Fetched over the network so the check doesn't pass/fail on a stale cache.
  const candidate =
    resolution.status === 'verifying' ? resolution.identity : null;
  const profile = useProfile(candidate, { fetchMode: FetchMode.Default });

  // Latch the verdict exactly once, when the candidate's profile first loads.
  useEffect(() => {
    if (resolution.status !== 'verifying' || profile.isLoading) return;
    // Both sides go through the same canonicaliser so a leading `@` or
    // differing case can't cause a false mismatch; a null on either side
    // fails closed.
    const expected = normalizeWebFingerHandle(handle);
    const claimed = profile.webfingerAlias
      ? normalizeWebFingerHandle(profile.webfingerAlias)
      : null;
    const verified = !!expected && claimed === expected;
    if (verified) {
      recordVerifiedAlias(handle, resolution.identity);
    }
    setResolution(
      verified
        ? { status: 'verified', identity: resolution.identity }
        : { status: 'unverified' },
    );
  }, [resolution, profile.isLoading, profile.webfingerAlias, handle]);

  switch (resolution.status) {
    case 'loading':
      return <WebFingerStatus message={`Resolving ${handle}…`} loading />;
    case 'verifying':
      return <WebFingerStatus message={`Verifying ${handle}…`} loading />;
    case 'not-found':
      return <WebFingerStatus message={`Couldn't find ${handle}`} />;
    case 'unverified':
      return <WebFingerStatus message={`Couldn't verify ${handle}`} />;
    case 'verified':
      return (
        <ProfileProvider identityKey={resolution.identity}>
          <ProfileScreenContent />
        </ProfileProvider>
      );
  }
}

function WebFingerStatus({
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
