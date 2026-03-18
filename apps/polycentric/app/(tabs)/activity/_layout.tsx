import { Stack } from 'expo-router';

export default function ActivityLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        title: 'Activity',
      }}
    />
  );
}
