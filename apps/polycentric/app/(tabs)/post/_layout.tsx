import { Stack } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '[postId]',
};

export default function PostLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="[postId]" />
    </Stack>
  );
}
