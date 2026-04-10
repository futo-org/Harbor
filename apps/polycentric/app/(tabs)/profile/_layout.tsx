import { Stack } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '[publicKey]',
};

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="[publicKey]" />
    </Stack>
  );
}
