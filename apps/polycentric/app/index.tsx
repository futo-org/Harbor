import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";

export default function Index() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [userOnboarded, setUserOnboarded] = useState(false);

  useEffect(() => {
    setIsInitialized(true);
  }, []);

  // wait for initialization to check if user is onboarded.
  if (!isInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (userOnboarded) {
    return <Redirect href="/(tabs)/feed" />;
  }

  return <Redirect href="/(onboarding)" />;
}
