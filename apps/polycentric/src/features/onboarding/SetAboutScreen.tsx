import { Screen, Box, Text, Button, TextInput, PageHeader } from '@/src/common/components';
import { useRouter } from 'expo-router';
import { useSignup } from '@/src/features/onboarding/signup/SignupContext';

export default function SetAboutScreen() {
  const router = useRouter();
  const { data, setAbout, goToNextStep, close } = useSignup();

  return (
    <Screen background={{ gradient: 'surround' }} keyboardAvoiding>
      <Box flexDirection="column" marginHorizontal="lg" height="100%">
        <PageHeader onBack={() => router.back()} onClose={close} />
        <Box flex={1} gap="lg">
          <Text variant="title">About this identity</Text>
          <TextInput
            placeholder="Tell others a bit about yourself"
            value={data.about}
            onChangeText={setAbout}
            numberOfLines={4}
            autoFocus
          />
        </Box>
        <Button
          title="Continue"
          variant="primary"
          fullWidth
          onPress={goToNextStep}
        />
      </Box>
    </Screen>
  );
}
