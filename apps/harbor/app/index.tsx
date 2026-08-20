import { Routes } from '@/src/common/constants';
import { usePolycentricContext } from '@/src/common/lib/polycentric-hooks';
import { isWeb } from '@/src/common/util/platform';
import ExploreScreen from '@/src/features/feed/ExploreScreen';
import OnboardingWelcomeScreen from '@/src/features/onboarding/OnboardingWelcomeScreen';
import type { Href } from 'expo-router';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';

function DismissRedirect({ href }: { href: Href }) {
  const router = useRouter();
  useFocusEffect(
    useCallback(() => {
      router.dismissTo(href);
    }, [href, router]),
  );
  return null;
}

export default function IndexScreen() {
  const { client, currentIdentity, isLoading, isReady } =
    usePolycentricContext();

  if (isLoading || !isReady || !client) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!currentIdentity) {
    // Web lands on the explore feed
    if (isWeb) {
      return <ExploreScreen />;
    }
    return <OnboardingWelcomeScreen />;
  }

  return <DismissRedirect href={Routes.tabs.feed.index as Href} />;
}
