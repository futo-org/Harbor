import { Fonts } from '@/assets';
import { GlobalHead } from '@/lib/GlobalHead';
import { PolycentricProvider } from '@/lib/polycentric-hooks';
import { ThemeProvider, useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { TrueSheetProvider } from '@lodev09/react-native-true-sheet';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { featureFlags } from 'react-native-screens';

const MAX_CONTENT_WIDTH = 535;
const SIDEBAR_BREAKPOINT = 980;

// Opt-in to fix for reattachment of dismissed screens when swiping back quickly (react-native-screens #2559 / PR #3584)
if ('iosPreventReattachmentOfDismissedScreens' in featureFlags.experiment) {
  (
    featureFlags.experiment as {
      iosPreventReattachmentOfDismissedScreens: boolean;
    }
  ).iosPreventReattachmentOfDismissedScreens = true;
}

void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter: Fonts.Inter,
    'Inter-Italic': Fonts['Inter-Italic'],
  });
  const [providerInitialized, setProviderInitialized] = useState(false);

  const onInitialized = useCallback(() => {
    setProviderInitialized(true);
  }, []);

  const appReady = fontsLoaded && providerInitialized;

  useEffect(() => {
    if (!appReady) {
      return;
    }
    void SplashScreen.hideAsync().catch(() => {});
  }, [appReady]);

  if (fontError) {
    throw fontError;
  }

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
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
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const showSidebars = width >= SIDEBAR_BREAKPOINT;
  const bg = theme.colors.backgroundPrimary;

  return (
    <View style={[styles.shell, { backgroundColor: bg }]}>
      <View
        style={[
          styles.sidebar,
          !showSidebars && styles.hidden,
          { backgroundColor: bg },
        ]}
      />
      <View
        style={[
          styles.centerRail,
          showSidebars ? styles.centerRailWide : styles.centerRailFull,
        ]}
      >
        <View style={[styles.centerColumn, { backgroundColor: 'transparent' }]}>
          <Stack
            screenOptions={{
              headerShown: false,
              fullScreenGestureEnabled: true,
            }}
          />
        </View>
      </View>
      <View
        style={[
          styles.sidebar,
          !showSidebars && styles.hidden,
          { backgroundColor: bg },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  shell: {
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
  },
  sidebar: {
    flex: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
  },
  centerRail: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: MAX_CONTENT_WIDTH,
    minWidth: 0,
  },
  centerRailWide: {
    maxWidth: MAX_CONTENT_WIDTH,
    width: MAX_CONTENT_WIDTH,
  },
  centerRailFull: {
    maxWidth: '100%',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },
  centerColumn: {
    flex: 1,
    minWidth: 0,
  },
  hidden: {
    display: 'none',
  },
});
