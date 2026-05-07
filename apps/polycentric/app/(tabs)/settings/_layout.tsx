import { isWeb } from '@/src/common/util/platform';
import { Stack } from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function SettingsTabStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        fullScreenGestureEnabled: !isWeb,
        ...(isWeb ? { animation: 'none' as const } : {}),
      }}
    />
  );
}
