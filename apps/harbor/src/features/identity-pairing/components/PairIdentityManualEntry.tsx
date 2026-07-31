import { Button, Text, TextInput } from '@/src/common/components';
import { Atoms } from '@/src/common/theme';
import { View } from 'react-native';

export interface PairIdentityManualEntryProps {
  input: string;
  setInput: (value: string) => void;
  onContinue: () => void;
}

export function PairIdentityManualEntry({
  input,
  setInput,
  onContinue,
}: PairIdentityManualEntryProps) {
  return (
    <>
      <Text variant="body" color="neutral_500">
        On your other device, go to Settings {'->'} Pair Identity.
      </Text>

      <View style={Atoms.gap_xs}>
        <Text variant="small" color="neutral_500">
          PAIRING CODE
        </Text>
        <TextInput
          value={input}
          onChangeText={setInput}
          autoCapitalize="none"
          style={{ fontFamily: 'monospace' }}
          multiline
          placeholder="Paste pairing code"
        />
      </View>

      <Button
        title="Continue"
        variant="primary"
        fullWidth
        onPress={onContinue}
        disabled={!input.trim()}
      />
    </>
  );
}
