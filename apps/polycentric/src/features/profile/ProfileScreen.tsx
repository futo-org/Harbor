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

  return (
    <ProfileProvider identityKey={identityId ?? null}>
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
  // Disabled (null identity) until resolution produces a candidate; fetched
  // over the network so the check doesn't pass/fail on a stale cache.
  const candidate =
    resolution.status === 'verifying' ? resolution.identity : null;
  const profile = useProfile(candidate, { fetchMode: FetchMode.Default });

  if (resolution.status === 'loading') {
    return <WebFingerStatus message={`Resolving ${handle}…`} loading />;
  }
  if (resolution.status === 'not-found') {
    return <WebFingerStatus message={`Couldn't find ${handle}`} />;
  }

  if (profile.isLoading) {
    return <WebFingerStatus message={`Verifying ${handle}…`} loading />;
  }

  // Both sides go through the same canonicaliser so a leading `@` or differing
  // case can't cause a false mismatch; a null on either side fails closed.
  const expected = normalizeWebFingerHandle(handle);
  const claimed = profile.webfingerAlias
    ? normalizeWebFingerHandle(profile.webfingerAlias)
    : null;
  if (!expected || claimed !== expected) {
    return <WebFingerStatus message={`Couldn't verify ${handle}`} />;
  }

  return (
    <ProfileProvider identityKey={resolution.identity}>
      <ProfileScreenContent />
    </ProfileProvider>
  );
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
