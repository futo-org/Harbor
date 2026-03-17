import { useState } from "react";
import { Screen, Box, Text, Button, TextInput, PageHeader } from "@/components";
import { useRouter } from "expo-router";
import { useSignup } from "@/lib/signup/SignupContext";
import { validateUsername } from "@/util/validation";

export default function SetUsername() {
  const router = useRouter();
  const { data, setUsername, close, goToNextStep } = useSignup();
  const [error, setError] = useState<string | null>(null);

  const canContinue = data.username.trim().length > 0;

  const handleChangeText = (text: string) => {
    if (error) {
      setError(null);
    }
    setUsername(text);
  };

  const handleContinue = () => {
    const validationError = validateUsername(data.username);
    if (validationError) {
      setError(validationError);
      return;
    }
    goToNextStep();
  };

  return (
    <Screen
      background={{ gradient: "surround", matrixOverlay: "colored" }}
      keyboardAvoiding
    >
      <Box flexDirection="column" marginHorizontal="lg" height="100%">
        <PageHeader onClose={close} />
        <Box flex={1} gap="lg">
          <Text variant="title">Set a username</Text>
          <Box gap="xs">
            <TextInput
              placeholder="Enter username"
              value={data.username}
              onChangeText={handleChangeText}
              error={error ? true : false}
              autoFocus
            />
            {error && (
              <Text variant="secondary" color="destructive">
                {error}
              </Text>
            )}
          </Box>
        </Box>
        <Button
          title="Continue"
          variant={canContinue ? "primary" : "disabled"}
          fullWidth
          onPress={handleContinue}
        />
      </Box>
    </Screen>
  );
}
