import { CharCount } from '@/src/common/components/composites/CharCount';
import { Button, Text, TextInput } from '@/src/common/components/primitives';
import { Atoms } from '@/src/common/theme';
import { useSignup } from '@/src/features/onboarding/signup/SignupContext';
import { MAX_NAME_LENGTH } from '@/src/features/profile/lib/decodeProfile';
import { useState } from 'react';
import { View } from 'react-native';

export default function SetDisplayNameScreen() {
  const { data, setDisplayName, finish, submitting } = useSignup();
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
    <View style={[Atoms.flex_col, Atoms.flex_1]}>
      <View style={[Atoms.flex_1, Atoms.gap_lg, Atoms.min_h_0]}>
        <Text variant="title">Set a display name</Text>
        <View style={Atoms.gap_xs}>
          <TextInput
            placeholder="Enter display name"
            value={data.displayName}
            onChangeText={handleChangeText}
            error={error ? true : false}
            maxLength={MAX_NAME_LENGTH}
            autoCapitalize="words"
            autoFocus
            disabled={submitting}
          />
          <CharCount count={data.displayName.length} max={MAX_NAME_LENGTH} />
          {error && (
            <Text variant="secondary" color="negative_500">
              {error}
            </Text>
          )}
        </View>
      </View>
      <Button
        style={[Atoms.mt_auto, Atoms.mb_md]}
        title={submitting ? 'Creating identity...' : 'Continue'}
        variant="primary"
        disabled={!canContinue || submitting}
        fullWidth
        onPress={handleContinue}
      />
    </View>
  );
}
