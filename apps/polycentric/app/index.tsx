import { Redirect } from 'expo-router';
import type { Href } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { Routes } from '@/src/common/constants';
import { usePolycentricContext } from '@/src/common/lib/polycentric-hooks';

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

  // If no identity, then prompt signup
  if (!currentIdentity) {
    // return <Redirect href="/(onboarding)" />;
  }

  return <Redirect href={Routes.tabs.feed.index as Href} />;
}
