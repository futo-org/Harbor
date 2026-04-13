import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
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

  // Gate on the resolved identity, not just the localStorage hint
  // (`activeIdentityKey`). If the hint points at an identity we don't have
  // content for, `currentIdentity` is null and we still send the user to
  // onboarding — self-heals stale state from earlier builds.
  if (!currentIdentity) {
    return <Redirect href="/(onboarding)" />;
  }

  return <Redirect href="/(tabs)/feed" />;
}
