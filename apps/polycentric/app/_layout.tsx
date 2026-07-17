import { Toaster } from '@/src/common/components/toast';
import { LinkPreviewsProvider } from '@/src/common/link-previews';
import {
  PolycentricProvider,
  usePolycentricContext,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, ThemeProvider, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import '@/src/common/util/react-native-screens-feature-flags';
import { TrueSheetProvider } from '@lodev09/react-native-true-sheet';
import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';

// Anchor the root stack on the tabs so that deep-linking directly
// into a modal route (e.g. `/feed/compose`, `/settings/identity`)
// mounts the tabs underneath — giving the modal something to sit on
// and a sensible target for the close button's `router.back()`.
export const unstable_settings = {
  initialRouteName: '(tabs)',
};

function RootStack() {
  const { theme } = useTheme();
  const { currentIdentity, isLoading, isReady } = usePolycentricContext();

  // Stay permissive until the identity store has settled — pruning routes
  // during startup would break deep links that resolve after login state.
  const accountGuard = isLoading || !isReady || !!currentIdentity;

  const stack = (
    <>
      <StatusBar style={theme.name === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          fullScreenGestureEnabled: !isWeb,
          contentStyle: [theme.atoms.bg, Atoms.flex_1, Atoms.overflow_auto],
          ...(isWeb
            ? { animation: 'none' as const }
            : { orientation: 'portrait_up' }),
        }}
      >
        {/* Mobile requires an account for the tabs (feeds, notifications,
            ...); deep-linked profile/post views stay public everywhere. On
            web the tabs stay routable and get granular guards instead. */}
        <Stack.Protected guard={isWeb || accountGuard}>
          <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
        </Stack.Protected>

        <Stack.Screen name="(onboarding)" options={{ animation: 'none' }} />

        {/* Account-only on every platform. Routes are auto-registered from
            the filesystem; the explicit declarations here exist to place
            them inside the guard. */}
        <Stack.Protected guard={accountGuard}>
          <Stack.Screen
            name="feed"
            options={{
              presentation: 'transparentModal',
              animation: isWeb ? 'fade' : 'default',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen name="settings" />
          <Stack.Screen
            name="[identityId]/edit"
            options={{
              presentation: 'transparentModal',
              animation: 'none',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen name="identity/switch" />
          <Stack.Screen name="verifications/index" />
          <Stack.Screen name="verifications/claim" />
        </Stack.Protected>

        <Stack.Screen
          name="image-viewer"
          options={{
            presentation: 'transparentModal',
            animation: 'fade',
            contentStyle: { backgroundColor: 'transparent' },
            // Let just this screen rotate to landscape; the rest of the
            // app stays portrait.
            ...(isWeb ? {} : { orientation: 'all' as const }),
          }}
        />
      </Stack>
    </>
  );

  return stack;
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const onInitialized = useCallback(() => setReady(true), []);

  useEffect(() => {
    if (!ready) {
      return;
    }
    void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  return (
    <GestureHandlerRootView style={Atoms.flex_1}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <ThemeProvider>
          <LinkPreviewsProvider>
            <PolycentricProvider onInitialized={onInitialized}>
              <TrueSheetProvider>
                <RootStack />
                <PortalHost />
                <Toaster />
              </TrueSheetProvider>
            </PolycentricProvider>
          </LinkPreviewsProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
