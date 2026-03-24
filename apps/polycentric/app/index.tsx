import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { usePolycentricContext } from '@/lib/polycentric-hooks';

export default function Index() {
  const { client, isLoading, isReady } = usePolycentricContext();

  if (isLoading || !isReady || !client) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // TODO: re-enable onboarding flow when ready
  // const hasIdentity = client.currentIdentity !== null;
  // if (!hasIdentity) {
  //   return <Redirect href="/(onboarding)" />;
  // }

  return <Redirect href="/(tabs)/feed" />;
}
