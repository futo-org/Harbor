import { ToastProvider } from '@/src/common/lib/toast';
import { Atoms } from '@/src/common/theme';
import { Stack } from 'expo-router';
import { View } from 'react-native';

export default function OnboardingLayout() {
  return (
    <View style={[Atoms.flex_1, Atoms.items_center]}>
      <ToastProvider contentColumn>
        <Stack screenOptions={{ headerShown: false }} />
      </ToastProvider>
    </View>
  );
}
