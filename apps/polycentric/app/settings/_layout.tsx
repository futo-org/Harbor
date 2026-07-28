import { Stack } from 'expo-router';

const sheetScreenOptions = {
  presentation: 'transparentModal',
  animation: 'none',
  contentStyle: { backgroundColor: 'transparent' },
} as const;

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="identity" options={sheetScreenOptions} />
      <Stack.Screen name="pair-identity" options={sheetScreenOptions} />
      <Stack.Screen name="servers" options={sheetScreenOptions} />
    </Stack>
  );
}
