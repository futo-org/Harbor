import { Screen, Button, ScreenHeader, Avatar } from '@/src/common/components';
import { Atoms } from '@/src/common/theme';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useSignup } from '@/src/features/onboarding/signup/SignupContext';
import { useImagePicker } from '@/src/common/lib/fs-pickers/useImagePicker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

export default function SetAvatarScreen() {
  const { data, setAvatarUri, goToNextStep, close } = useSignup();

  const { pickPhoto } = useImagePicker({
    allowsEditing: true,
    aspect: [1, 1],
    onSelect: setAvatarUri,
  });

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled && result.assets?.[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const removePhoto = () => {
    setAvatarUri(null);
  };

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View style={[Atoms.flex_col, Atoms.mx_lg, Atoms.h_full]}>
          <ScreenHeader onBack={() => router.back()} onClose={close} />
          <View style={[Atoms.flex_1, Atoms.items_center, Atoms.mt_2xl]}>
            <Avatar
              size="massive"
              source={data.avatarUri ? { uri: data.avatarUri } : undefined}
            />
          </View>
          <View style={[Atoms.gap_md, Atoms.mb_md]}>
            <Button
              title="Take Photo"
              variant="secondary"
              fullWidth
              onPress={takePhoto}
              icon={({ size, color }) => (
                <Ionicons name="camera-outline" size={size} color={color} />
              )}
            />
            <Button
              title="Choose from Library"
              variant="secondary"
              fullWidth
              onPress={pickPhoto}
              icon={({ size, color }) => (
                <Ionicons name="images-outline" size={size} color={color} />
              )}
            />
            {data.avatarUri && (
              <Button
                title="Remove Photo"
                variant="destructive"
                fullWidth
                onPress={removePhoto}
                icon={({ size, color }) => (
                  <Ionicons name="trash-outline" size={size} color={color} />
                )}
              />
            )}
          </View>
          <Button
            title="Continue"
            variant="primary"
            fullWidth
            onPress={goToNextStep}
          />
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
