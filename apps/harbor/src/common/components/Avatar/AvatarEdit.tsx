import { type ComponentProps, useState } from 'react';
import { Avatar } from './Avatar';
import * as ImagePicker from 'expo-image-picker';
import { IMAGE_PICKER_DEFAULT_OPTIONS } from '@/src/common/lib/images/loadBoundedImage';

type AvatarEditProps = {
  /** Avatar shown until the user picks a new image. */
  defaultUri: string;
  onSelect?: (uri: string) => void;
} & Omit<ComponentProps<typeof Avatar>, 'source' | 'onPress'>;

export default function AvatarEdit({
  defaultUri,
  onSelect,
  ...props
}: AvatarEditProps) {
  const [selectedUri, setSelectedUri] = useState<string>();

  const onPress = async () => {
    const result = await ImagePicker.launchImageLibraryAsync(
      IMAGE_PICKER_DEFAULT_OPTIONS,
    );

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const asset = result.assets[0];
    setSelectedUri(asset.uri);
    onSelect?.(asset.uri);
  };

  return (
    <Avatar
      {...props}
      source={{ uri: selectedUri ?? defaultUri }}
      onPress={onPress}
    />
  );
}
