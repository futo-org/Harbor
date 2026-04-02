import { Stack } from 'expo-router';
import { SignupProvider } from '@/src/features/onboarding/signup/SignupContext';

export default function SignupStackLayoutScreen() {
  return (
    <SignupProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SignupProvider>
  );
}
