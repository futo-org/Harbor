import { PolycentricProvider } from '@/src/common/lib/polycentric-hooks';
import { Atoms, ThemeProvider, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { WideShell } from '@/src/features/wideshell';
import '@/src/common/util/react-native-screens-feature-flags';
import { TrueSheetProvider } from '@lodev09/react-native-true-sheet';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
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

  const stack = (
    <Stack
      screenOptions={{
        headerShown: false,
        fullScreenGestureEnabled: !isWeb,
        contentStyle: [theme.atoms.bg, Atoms.flex_1, Atoms.overflow_auto],
        ...(isWeb ? { animation: 'none' as const } : {}),
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen
        name="feed"
        options={{
          presentation: 'transparentModal',
          animation: 'none',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          presentation: 'transparentModal',
          animation: 'none',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="[identityId]/edit"
        options={{
          presentation: 'transparentModal',
          animation: 'none',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </Stack>
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
          <PolycentricProvider onInitialized={onInitialized}>
            <TrueSheetProvider>
              <RootStack />
            </TrueSheetProvider>
          </PolycentricProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
