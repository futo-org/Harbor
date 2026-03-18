import { Stack } from 'expo-router';

export default function ClaimsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        title: 'Claims',
      }}
    />
  );
}
