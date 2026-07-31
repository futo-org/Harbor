import { Atoms, useTheme } from '@/src/common/theme';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

// The OAuth pop-up lands here on web; this hands the callback URL back to
// `openAuthSessionAsync` and closes the pop-up. Module scope on purpose — it
// should run before anything renders. Native flows never reach this page:
// the bot redirects them to the app scheme directly.
WebBrowser.maybeCompleteAuthSession();

export default function OAuthCallbackScreen() {
  const { theme } = useTheme();

  // Opened directly rather than as a pop-up: go home.
  useEffect(() => {
    const timeout = setTimeout(() => router.replace('/'), 2000);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <View
      style={[
        theme.atoms.bg,
        Atoms.flex_1,
        Atoms.align_center,
        Atoms.justify_center,
      ]}
    >
      <ActivityIndicator
        size="small"
        color={theme.palette.primary_500}
        accessibilityLabel="Completing sign-in"
      />
    </View>
  );
}
