import { GlobalHead } from '@/src/common/lib/GlobalHead';
import { PolycentricProvider } from '@/src/common/lib/polycentric-hooks';
import {
  Atoms,
  ThemeProvider,
  useBreakpoint,
  useTheme,
} from '@/src/common/theme';
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

const MAX_CONTENT_WIDTH = 535;

void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [providerInitialized, setProviderInitialized] = useState(false);

  const onInitialized = useCallback(() => {
    setProviderInitialized(true);
  }, []);

  useEffect(() => {
    if (!providerInitialized) {
      return;
    }
    void SplashScreen.hideAsync().catch(() => {});
  }, [providerInitialized]);

  return (
    <GestureHandlerRootView style={Atoms.flex_1}>
      <GlobalHead />
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
    return <NarrowLayoutShell />;
  }

  return <WideLayoutShell />;
}

function NarrowLayoutShell() {
  const { theme } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        fullScreenGestureEnabled: true,
        contentStyle: theme.atoms.bg,
      }}
    />
  );
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
          { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
        ]}
      >
        <Stack
          screenOptions={{
            headerShown: false,
            fullScreenGestureEnabled: true,
            contentStyle: theme.atoms.bg,
          }}
        />
      </View>
    </View>
  );
}
