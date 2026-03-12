import { Screen, Box, Button, PageHeader, Avatar } from "@/components";
import { useRouter } from "expo-router";
import { useSignup } from "@/lib/signup/SignupContext";
import { useImagePicker } from "@/lib/fs-pickers/useImagePicker";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";

export default function SetAvatar() {
  const router = useRouter();
  const { data, setAvatarUri, goToNextStep, close } = useSignup();

  const { pickPhoto } = useImagePicker({
    allowsEditing: true,
    aspect: [1, 1],
    onSelect: setAvatarUri,
  });

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
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
    <Screen background={{ gradient: "surround" }}>
      <Box flexDirection="column" marginHorizontal="lg" height="100%">
        <PageHeader onBack={() => router.back()} onClose={close} />
        <Box flex={1} alignItems="center" marginTop="2xl">
          <Avatar
            size="massive"
            source={data.avatarUri ? { uri: data.avatarUri } : undefined}
          />
        </Box>
        <Box gap="md" marginBottom="md">
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
        </Box>
        <Button
          title="Continue"
          variant="primary"
          fullWidth
          onPress={goToNextStep}
        />
      </Box>
    </Screen>
  );
}
