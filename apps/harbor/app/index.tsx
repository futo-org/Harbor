import { Routes } from '@/src/common/constants';
import { usePolycentricContext } from '@/src/common/lib/polycentric-hooks';
import { isWeb } from '@/src/common/util/platform';
import ExploreScreen from '@/src/features/feed/ExploreScreen';
import OnboardingWelcomeScreen from '@/src/features/onboarding/OnboardingWelcomeScreen';
import type { Href } from 'expo-router';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

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

  return <Redirect href={Routes.tabs.feed.index as Href} />;
}
