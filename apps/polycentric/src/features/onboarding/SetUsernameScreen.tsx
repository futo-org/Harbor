import { useState } from 'react';
import {
  Screen,
  Text,
  Button,
  TextInput,
  ScreenHeader,
} from '@/src/common/components';
import { Atoms } from '@/src/common/theme';
import { View } from 'react-native';
import { useSignup } from '@/src/features/onboarding/signup/SignupContext';
import { validateUsername } from '@/src/common/util/validation';

export default function SetUsernameScreen() {
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
    <Screen keyboardAvoiding>
      <Screen.PrimaryColumn>
        <View style={[Atoms.flex_col, Atoms.mx_lg, Atoms.h_full]}>
          <ScreenHeader onClose={close} />
          <View style={[Atoms.flex_1, Atoms.gap_lg]}>
            <Text variant="title">Set a username</Text>
            <View style={Atoms.gap_xs}>
              <TextInput
                placeholder="Enter username"
                value={data.username}
                onChangeText={handleChangeText}
                error={error ? true : false}
                autoFocus
              />
              {error && (
                <Text variant="secondary" color="negative_500">
                  {error}
                </Text>
              )}
            </View>
          </View>
          <Button
            title="Continue"
            variant="primary"
            disabled={!canContinue}
            fullWidth
            onPress={handleContinue}
          />
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
