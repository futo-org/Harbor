import { Stack, useRouter, useSegments } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { featureFlags } from "react-native-screens";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import { useEffect, useState } from "react";
import { ThemeProvider } from "@/theme";
import { Fonts } from "@/assets";
import {
  PolycentricProvider,
  usePolycentricContext,
} from "@/lib/polycentric-hooks";

// Opt-in to fix for reattachment of dismissed screens when swiping back quickly (react-native-screens #2559 / PR #3584)
if ("iosPreventReattachmentOfDismissedScreens" in featureFlags.experiment) {
  (featureFlags.experiment as { iosPreventReattachmentOfDismissedScreens: boolean }).iosPreventReattachmentOfDismissedScreens = true;
}

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const router = useRouter();
  const segments = useSegments();
  const { client, isLoading, isReady } = usePolycentricContext();
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);

  useEffect(() => {
    if (isLoading || !isReady || !client) {
      return;
    }

    // Only redirect once after initial load
    if (hasCheckedAuth) {
      return;
    }

    const hasIdentity = client.currentIdentity !== null;
    const inOnboarding = segments[0] === "(onboarding)";
    const inTabs = segments[0] === "(tabs)";

    setHasCheckedAuth(true);

    if (hasIdentity && !inTabs) {
      // User has identity, go to feed
      router.replace("/(tabs)/feed");
    } else if (!hasIdentity && !inOnboarding) {
      // No identity, show onboarding
      router.replace("/(onboarding)");
    }

    // Hide splash screen after navigation decision is made
    SplashScreen.hideAsync();
  }, [isLoading, isReady, client, segments, hasCheckedAuth, router]);

  // Don't render anything until we've made the navigation decision
  if (!hasCheckedAuth) {
    return null;
  }

  return (
    <Stack
      screenOptions={{ headerShown: false, fullScreenGestureEnabled: true }}
    />
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter: Fonts.Inter,
    "Inter-Italic": Fonts["Inter-Italic"],
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <ThemeProvider>
          <PolycentricProvider>
            <RootNavigator />
          </PolycentricProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
