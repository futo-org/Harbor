import { WEB_MAX_CONTENT_WIDTH } from '@/src/common/constants';
import { PolycentricProvider } from '@/src/common/lib/polycentric-hooks';
import {
  Atoms,
  ThemeProvider,
  useBreakpoint,
  useTheme,
} from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import '@/src/common/util/react-native-screens-feature-flags';
import { TrueSheetProvider } from '@lodev09/react-native-true-sheet';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';

if (!isWeb) {
  void SplashScreen.preventAutoHideAsync().catch(() => {});
}

export default function RootLayout() {
  return isWeb ? <WebRootLayout /> : <NativeRootLayout />;
}

function WebRootLayout() {
  return (
    <View style={Atoms.flex_1}>
      <ThemeProvider>
        <PolycentricProvider>
          <RootNavigatorShell />
        </PolycentricProvider>
      </ThemeProvider>
    </View>
  );
}

function NativeRootLayout() {
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
              <RootNavigatorShell />
            </TrueSheetProvider>
          </PolycentricProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigatorShell() {
  const { isLarge } = useBreakpoint();

  if (!isLarge) {
    return <RootStack />;
  }

  return <WideLayoutShell />;
}

function WideLayoutShell() {
  const { theme } = useTheme();

  return (
    <View style={[Atoms.flex_1, theme.atoms.bg]}>
      <View
        style={[
          Atoms.flex_1,
          Atoms.min_w_0,
          Atoms.w_full,
          { maxWidth: WEB_MAX_CONTENT_WIDTH, alignSelf: 'center' },
        ]}
      >
        <RootStack />
      </View>
    </View>
  );
}

function RootStack() {
  const { theme } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        fullScreenGestureEnabled: !isWeb,
        contentStyle: [theme.atoms.bg, Atoms.flex_1],
        ...(isWeb ? { animation: 'none' as const } : {}),
      }}
    />
  );
}
