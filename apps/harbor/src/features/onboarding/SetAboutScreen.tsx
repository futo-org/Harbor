import {
  Button,
  CharCount,
  Screen,
  ScreenHeader,
  Text,
  TextInput,
} from '@/src/common/components';
import { Atoms } from '@/src/common/theme';
import { useSignup } from '@/src/features/onboarding/signup/SignupContext';
import { MAX_BIO_LENGTH } from '@/src/features/profile/lib/decodeProfile';
import { router } from 'expo-router';
import { View } from 'react-native';

export default function SetAboutScreen() {
  const { data, setAbout, goToNextStep, close } = useSignup();

  return (
    <Screen keyboardAvoiding>
      <Screen.PrimaryColumn>
        <View style={[Atoms.flex_col, Atoms.flex_1, Atoms.mx_lg]}>
          <ScreenHeader onBack={() => router.back()} onClose={close} />
          <View style={[Atoms.flex_1, Atoms.gap_lg, Atoms.min_h_0]}>
            <Text variant="title">About this identity</Text>
            <TextInput
              placeholder="Tell others a bit about yourself"
              value={data.about}
              onChangeText={setAbout}
              maxLength={MAX_BIO_LENGTH}
              numberOfLines={4}
              autoFocus
            />
            <CharCount count={data.about.length} max={MAX_BIO_LENGTH} />
          </View>
          <Button
            style={Atoms.mt_auto}
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
