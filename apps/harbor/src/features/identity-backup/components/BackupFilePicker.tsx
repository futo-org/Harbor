import { Button, Text } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Atoms } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import * as DocumentPicker from 'expo-document-picker';
import { File as FsFile } from 'expo-file-system';
import { View } from 'react-native';

/** In-memory copy of the file that the user picked */
export type PickedBackupFile = {
  /** File name to display. */
  name: string;

  /** File contents */
  contents: string;
};

/**
 * Ask the user for a backup file and read it.
 * Returns `undefined` if they cancel.
 */
async function pickBackupFile(): Promise<PickedBackupFile | undefined> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: false,
    base64: false,
  });

  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return undefined;

  let contents: string;
  if (isWeb) {
    if (!asset.file) throw new Error('The picker returned no file to read');
    contents = await asset.file.text();
  } else {
    contents = await new FsFile(asset.uri).text();
  }

  return { name: asset.name, contents };
}

export interface BackupFilePickerProps {
  /** Filename to display if the user has already picked a file. */
  picked: PickedBackupFile | undefined;
  disabled?: boolean;
  /** Callback for a successful file selection and read. */
  onPicked: (file: PickedBackupFile) => void;
}

/**
 * Allow the user to select a backup file.
 */
export function BackupFilePicker({
  picked,
  disabled,
  onPicked,
}: BackupFilePickerProps) {
  const onPress = async () => {
    try {
      const file = await pickBackupFile();
      if (file) onPicked(file);
    } catch (err: unknown) {
      console.warn('Failed to read the chosen backup file:', err);
    }
  };

  return (
    <View style={[Atoms.gap_sm, Atoms.items_center, Atoms.my_3xl]}>
      <Button
        title={picked ? 'Choose a different file' : 'Choose backup file'}
        variant="primary"
        fullWidth
        disabled={disabled}
        icon={({ size, color }) => (
          <Icon name="document" size={size} color={color} />
        )}
        onPress={() => void onPress()}
      />
      {picked && (
        <Text
          variant="small"
          color="neutral_500"
          numberOfLines={1}
          style={{ fontFamily: 'monospace' }}
        >
          {picked.name}
        </Text>
      )}
    </View>
  );
}
