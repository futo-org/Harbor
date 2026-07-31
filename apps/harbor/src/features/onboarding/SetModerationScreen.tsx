import { Button, Screen, ScreenHeader, Text } from '@/src/common/components';
import { Atoms } from '@/src/common/theme';
import { useSignup } from '@/src/features/onboarding/signup/SignupContext';
import { router } from 'expo-router';
import { View } from 'react-native';

export default function SetModerationScreen() {
  const { close, finish } = useSignup();

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View style={[Atoms.flex_col, Atoms.flex_1, Atoms.mx_lg]}>
          <ScreenHeader onBack={() => router.back()} onClose={close} />
          <View style={[Atoms.flex_1, Atoms.gap_sm, Atoms.min_h_0]}>
            <Text variant="title">Device content moderation</Text>
            <Text variant="body" color="neutral_500">
              Content moderation only filters what you see on this device if you
              are using the default futo.org server.
            </Text>
            <Text variant="body" color="neutral_500">
              You will still be able to create posts that violate these
              settings.
            </Text>
            <Text variant="body" color="neutral_500">
              Polycentric will never block or censor content.
            </Text>
            <Text variant="body" color="neutral_500">
              This setting can be changed at any time in your settings.
            </Text>
            <Text variant="body" color="primary_500">
              dev note: Make this more succinct. maybe put some in an info
              window.
            </Text>
          </View>
          <Button
            style={Atoms.mt_auto}
            title="Finish"
            variant="primary"
            fullWidth
            onPress={finish}
          />
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
