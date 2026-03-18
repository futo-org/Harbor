import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { featureFlags } from 'react-native-screens';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme';
import { Fonts } from '@/assets';
import { PolycentricProvider } from '@/lib/polycentric-hooks';

// Opt-in to fix for reattachment of dismissed screens when swiping back quickly (react-native-screens #2559 / PR #3584)
if ('iosPreventReattachmentOfDismissedScreens' in featureFlags.experiment) {
  (
    featureFlags.experiment as {
      iosPreventReattachmentOfDismissedScreens: boolean;
    }
  ).iosPreventReattachmentOfDismissedScreens = true;
}

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter: Fonts.Inter,
    'Inter-Italic': Fonts['Inter-Italic'],
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <ThemeProvider>
          <PolycentricProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                fullScreenGestureEnabled: true,
              }}
            />
          </PolycentricProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
