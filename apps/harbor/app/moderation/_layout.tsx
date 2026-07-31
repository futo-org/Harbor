import { Stack } from 'expo-router';

export default function ModerationLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="ban-list" />
    </Stack>
  );
}
