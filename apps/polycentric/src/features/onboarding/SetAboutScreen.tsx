import {
  Screen,
  Text,
  Button,
  TextInput,
  ScreenHeader,
} from '@/src/common/components';
import { Atoms } from '@/src/common/theme';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useSignup } from '@/src/features/onboarding/signup/SignupContext';

export default function SetAboutScreen() {
  const { data, setAbout, goToNextStep, close } = useSignup();

  return (
    <Screen keyboardAvoiding>
      <Screen.PrimaryColumn>
        <View style={[Atoms.flex_col, Atoms.mx_lg, Atoms.h_full]}>
          <ScreenHeader onBack={() => router.back()} onClose={close} />
          <View style={[Atoms.flex_1, Atoms.gap_lg]}>
            <Text variant="title">About this identity</Text>
            <TextInput
              placeholder="Tell others a bit about yourself"
              value={data.about}
              onChangeText={setAbout}
              numberOfLines={4}
              autoFocus
            />
          </View>
          <Button
            title="Continue"
            variant="primary"
            fullWidth
            onPress={goToNextStep}
          />
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
