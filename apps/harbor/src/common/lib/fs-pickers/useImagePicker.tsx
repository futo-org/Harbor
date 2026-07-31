import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';

export interface UseImagePickerOptions {
  allowsEditing?: boolean;
  aspect?: [number, number];
  quality?: number;
  onSelect?: (uri: string) => void;
  onCancel?: () => void;
  onError?: (error: Error) => void;
}

export interface UseImagePickerReturn {
  pickPhoto: () => Promise<string | null>;
  error: Error | null;
}

export function useImagePicker(
  options: UseImagePickerOptions = {},
): UseImagePickerReturn {
  const {
    allowsEditing = false,
    aspect,
    quality = 1,
    onSelect,
    onCancel,
    onError,
  } = options;

  const [error, setError] = useState<Error | null>(null);

  const pickPhoto = async (): Promise<string | null> => {
    setError(null);

    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        const permissionError = new Error(
          'Permission to access media library is required',
        );
        setError(permissionError);
        if (onError) {
          onError(permissionError);
        }
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing,
        aspect,
        quality,
      });

      if (result.canceled) {
        if (onCancel) onCancel();
        return null;
      }

      if (result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        if (onSelect) {
          onSelect(uri);
        }
        return uri;
      }

      return null;
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to pick photo');
      setError(error);
      if (onError) {
        onError(error);
      }
      return null;
    }
  };

  return {
    pickPhoto,
    error,
  };
}
