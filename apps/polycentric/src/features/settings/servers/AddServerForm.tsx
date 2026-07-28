import { IconButton, Text, TextInput } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Atoms, useTheme } from '@/src/common/theme';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

interface AddServerFormProps {
  isBusy: boolean;
  error: Error | null;
  onSubmit: (url: string) => Promise<boolean>;
}

export function AddServerForm({ isBusy, error, onSubmit }: AddServerFormProps) {
  const { theme } = useTheme();
  const [url, setUrl] = useState('');
  const [showErrorLogs, setShowErrorLogs] = useState(false);

  const handleSubmit = async () => {
    setShowErrorLogs(false);
    if (await onSubmit(url.trim())) {
      setUrl('');
    }
  };

  return (
    <View style={Atoms.gap_md}>
      <View style={[Atoms.flex_row, Atoms.gap_sm, Atoms.items_center]}>
        <View style={Atoms.flex_1}>
          <TextInput
            rounded="lg"
            placeholder="https://server.example.com"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </View>
        {isBusy ? (
          <ActivityIndicator accessibilityLabel="Adding server" />
        ) : (
          <IconButton
            variant="ghost"
            icon={() => (
              <Icon
                name="addOutline"
                size={28}
                color={url.trim() ? 'primary_500' : 'neutral_500'}
              />
            )}
            onPress={handleSubmit}
          />
        )}
      </View>
      {error && (
        <Pressable
          onPress={() => setShowErrorLogs((v) => !v)}
          style={[
            Atoms.p_md,
            Atoms.rounded_lg,
            {
              backgroundColor: theme.palette.negative_25,
              borderWidth: 1,
              borderColor: theme.palette.negative_100,
            },
          ]}
        >
          <Text variant="secondary" color="negative_500">
            Could not add server.
            <Text fontWeight="bold" color="negative_500">
              {' '}
              {showErrorLogs ? 'Hide logs' : 'Show logs'}.
            </Text>
          </Text>
          {showErrorLogs && (
            <Text
              variant="secondary"
              color="neutral_500"
              style={{ fontFamily: 'monospace' }}
            >
              {error.stack ?? error.message}
            </Text>
          )}
        </Pressable>
      )}
    </View>
  );
}
