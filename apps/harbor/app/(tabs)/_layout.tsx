import { openCompose } from '@/src/common/constants';
import { usePolycentricContext } from '@/src/common/lib/polycentric-hooks';
import { useTheme } from '@/src/common/theme';
import useUnreadNotificationCount, {
  unreadNotificationsBadgeLabel,
} from '@/src/features/notifications/hooks/useUnreadNotificationCount';
import { isIOS, isWeb } from '@/src/common/util/platform';
import { Stack } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function TabsLayout() {
  const { theme } = useTheme();
  const { currentIdentity, isLoading, isReady } = usePolycentricContext();
  // The web sidebar subscribes itself.
  const unreadNotificationsLabel = unreadNotificationsBadgeLabel(
    useUnreadNotificationCount(!isWeb),
  );

  // Stay permissive until the identity store has settled — pruning routes
  // during startup would break deep links that resolve after login state.
  const accountGuard = isLoading || !isReady || !!currentIdentity;

  if (isWeb) {
    // Web has no visible tab bar (the sidebar in Layout.tsx is the nav);
    // a navigator is used instead of a plain <Slot/> so the account-only
    // routes can be route-guarded. Guarded routes are removed from
    // navigation while logged out; explore/search stay public.
    return (
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none',
        }}
      >
        <Stack.Protected guard={accountGuard}>
          <Stack.Screen name="feed" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="verifications" />
          <Stack.Screen name="compose" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="claims" />
        </Stack.Protected>
        <Stack.Screen name="explore" />
        <Stack.Screen name="search" />
      </Stack>
    );
  }

  return (
    <NativeTabs
      backBehavior="history"
      minimizeBehavior="never"
      backgroundColor={theme.palette.neutral_0}
      iconColor={theme.palette.neutral_900}
      tintColor={theme.palette.neutral_900}
      indicatorColor={theme.palette.neutral_25}
      rippleColor={theme.palette.neutral_50}
      badgeBackgroundColor={theme.palette.primary_500}
      badgeTextColor={theme.palette.neutral_0}
    >
      <NativeTabs.Trigger name="feed">
        <NativeTabs.Trigger.Label>Feed</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house" md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="notifications">
        <NativeTabs.Trigger.Label>Notifications</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bell" md="notifications" />
        {unreadNotificationsLabel && (
          <NativeTabs.Trigger.Badge>
            {unreadNotificationsLabel}
          </NativeTabs.Trigger.Badge>
        )}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="verifications">
        <NativeTabs.Trigger.Label>Verifications</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="checkmark.seal" md="verified" />
      </NativeTabs.Trigger>

      {isIOS ? (
        <NativeTabs.Trigger
          name="compose"
          role="search"
          // This tab screen cannot be selected: the tap opens the same
          // root-stack composer that New Post on Android and replies (both iOS
          // and Android) use
          disabled
          listeners={{ tabPress: () => openCompose() }}
        >
          <NativeTabs.Trigger.Label hidden>Compose</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="square.and.pencil" md="edit" />
        </NativeTabs.Trigger>
      ) : null}
    </NativeTabs>
  );
}
