import { ComponentProps, useState } from 'react';
import { Avatar } from './Avatar';
import { identiconUrl } from '../../lib/polycentric-hooks';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset } from 'expo-image-picker';

type AvatarEditProps = {
  identity: string;
  onSelect?: (uri: string) => void;
} & ComponentProps<typeof Avatar>;
export default function AvatarEdit({
  identity,
  onSelect,
  ...props
}: AvatarEditProps) {
  const [avatarUrl, setAvatarUrl] = useState<string>(
    identiconUrl(identity, 160),
  );

  const onPress = async () => {
    const result = await ImagePicker.launchImageLibraryAsync();

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const asset = result.assets[0];
    setAvatarUrl(asset.uri);
    onSelect?.(asset.uri);
  };

  return <Avatar {...props} source={{ uri: avatarUrl }} onPress={onPress} />;
}
