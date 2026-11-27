import { Button, Text, TextInput } from '@/src/common/components/primitives';
import { Atoms } from '@/src/common/theme';
import { View } from 'react-native';
import { PAIRING_SCAN_COPY, type ScanCopy } from './PairIdentityCamera.types';

export interface PairIdentityManualEntryProps {
  input: string;
  setInput: (value: string) => void;
  onContinue: () => void;
  copy?: ScanCopy;
}

export function PairIdentityManualEntry({
  input,
  setInput,
  onContinue,
  copy = PAIRING_SCAN_COPY,
}: PairIdentityManualEntryProps) {
  return (
    <>
      <Text variant="body" color="muted">
        {copy.hint}
      </Text>

      <View style={Atoms.gap_xs}>
        <Text variant="small" color="muted">
          {copy.label}
        </Text>
        <TextInput
          value={input}
          onChangeText={setInput}
          autoCapitalize="none"
          monospace
          multiline
          placeholder={copy.placeholder}
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
