import {
  Button,
  Screen,
  ScreenHeader,
  Text,
  TextInput,
} from '@/src/common/components';
import { Atoms } from '@/src/common/theme';
import { useSignup } from '@/src/features/onboarding/signup/SignupContext';
import { useState } from 'react';
import { View } from 'react-native';

export default function SetDisplayNameScreen() {
  const { data, setDisplayName, close, finish } = useSignup();
  const [error, setError] = useState<string | null>(null);

  const canContinue = data.displayName.trim().length > 0;

  const handleChangeText = (text: string) => {
    if (error) {
      setError(null);
    }
    setDisplayName(text);
  };

  const handleContinue = () => {
    if (!data.displayName.trim()) {
      setError('Display name is required');
      return;
    }
    finish();
  };

  return (
    <Screen keyboardAvoiding>
      <Screen.PrimaryColumn>
        <View style={[Atoms.flex_col, Atoms.flex_1, Atoms.mx_lg]}>
          <ScreenHeader onClose={close} />
          <View style={[Atoms.flex_1, Atoms.gap_lg, Atoms.min_h_0]}>
            <Text variant="title">Set a display name</Text>
            <View style={Atoms.gap_xs}>
              <TextInput
                placeholder="Enter display name"
                value={data.displayName}
                onChangeText={handleChangeText}
                error={error ? true : false}
                autoCapitalize="words"
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
            style={Atoms.mt_auto}
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
