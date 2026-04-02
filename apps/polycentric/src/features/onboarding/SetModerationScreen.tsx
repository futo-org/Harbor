import { Screen, Box, Text, Button, PageHeader } from '@/src/common/components';
import { Atoms } from '@/src/common/theme';
import { useRouter } from 'expo-router';
import { useSignup } from '@/src/features/onboarding/signup/SignupContext';

export default function SetModerationScreen() {
  const router = useRouter();
  const { close, finish } = useSignup();

  return (
    <Screen background={{ gradient: 'surround' }}>
      <Box style={[Atoms.flex_col, Atoms.mx_lg, Atoms.h_full]}>
        <PageHeader onBack={() => router.back()} onClose={close} />
        <Box style={[Atoms.flex_1, Atoms.gap_sm]}>
          <Text variant="title">Device content moderation</Text>
          <Text variant="body" color="neutral_500">
            Content moderation only filters what you see on this device if you
            are using the default futo.org server.
          </Text>
          <Text variant="body" color="neutral_500">
            You will still be able to create posts that violate these settings.
          </Text>
          <Text variant="body" color="neutral_500">
            Polycentric will never block or censor content.
          </Text>
          <Text variant="body" color="neutral_500">
            This setting can be changed at any time in your settings.
          </Text>
          <Text variant="body" color="primary_500">
            dev note: Make this more succinct. maybe put some in an info window.
          </Text>
        </Box>
        <Button title="Finish" variant="primary" fullWidth onPress={finish} />
      </Box>
    </Screen>
  );
}
