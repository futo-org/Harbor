import {
  Screen,
  Box,
  Text,
  Button,
  TextInput,
  PageHeader,
} from '@/src/common/components';
import { Atoms } from '@/src/common/theme';
import { router } from 'expo-router';
import { useSignup } from '@/src/features/onboarding/signup/SignupContext';

export default function SetAboutScreen() {
  const { data, setAbout, goToNextStep, close } = useSignup();

  return (
    <Screen keyboardAvoiding>
      <Box style={[Atoms.flex_col, Atoms.mx_lg, Atoms.h_full]}>
        <PageHeader onBack={() => router.back()} onClose={close} />
        <Box style={[Atoms.flex_1, Atoms.gap_lg]}>
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
