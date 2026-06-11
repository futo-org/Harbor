import { Stack } from 'expo-router';

const sheetScreenOptions = {
  presentation: 'transparentModal',
  animation: 'none',
  contentStyle: { backgroundColor: 'transparent' },
} as const;

export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="identity/index" />
      <Stack.Screen
        name="identity/keypair/[pubkey]"
        options={sheetScreenOptions}
      />
      <Stack.Screen name="pair-identity" options={sheetScreenOptions} />
      <Stack.Screen name="servers" options={sheetScreenOptions} />
    </Stack>
  );
}
