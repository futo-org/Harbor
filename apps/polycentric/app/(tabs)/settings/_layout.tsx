import { Stack } from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        title: 'Settings',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        name="identity"
        options={{
          presentation: 'transparentModal',
          animation: 'none',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="servers"
        options={{
          presentation: 'transparentModal',
          animation: 'none',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </Stack>
  );
}
