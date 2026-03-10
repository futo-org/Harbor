import { Stack } from "expo-router";

export default function FeedLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        fullScreenGestureEnabled: true,
        title: "Feed",
      }}
    />
  );
}
