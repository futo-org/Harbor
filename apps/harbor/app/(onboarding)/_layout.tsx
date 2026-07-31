import { Atoms } from '@/src/common/theme';
import { Slot } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function OnboardingLayout() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[Atoms.flex_1, { paddingBottom: insets.bottom }]}>
      <Slot />
    </View>
  );
}
