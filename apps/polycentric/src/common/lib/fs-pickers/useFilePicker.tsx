import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';

export interface UseFilePickerOptions {
  type?: string | string[];
  copyToCacheDirectory?: boolean;
  onSelect?: (file: DocumentPicker.DocumentPickerAsset) => void;
  onCancel?: () => void;
  onError?: (error: Error) => void;
}

export interface UseFilePickerReturn {
  pickFile: () => Promise<DocumentPicker.DocumentPickerAsset | null>;
  error: Error | null;
}

export function useFilePicker(
  options: UseFilePickerOptions = {},
): UseFilePickerReturn {
  const {
    type = '*/*',
    copyToCacheDirectory = true,
    onSelect,
    onCancel,
    onError,
  } = options;

  const [error, setError] = useState<Error | null>(null);

  const pickFile =
    async (): Promise<DocumentPicker.DocumentPickerAsset | null> => {
      setError(null);

      try {
        const result = await DocumentPicker.getDocumentAsync({
          type,
          copyToCacheDirectory,
        });

        if (result.canceled) {
          if (onCancel) onCancel();
          return null;
        }

        if (result.assets && result.assets.length > 0) {
          const file = result.assets[0];
          if (onSelect) {
            onSelect(file);
          }
          return file;
        }

        return null;
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to pick file');
        setError(error);
        if (onError) {
          onError(error);
        }
        return null;
      }
    };

  return {
    pickFile,
    error,
  };
}
