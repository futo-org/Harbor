import { Screen, Text, Button } from '@/src/common/components';
import { Atoms } from '@/src/common/theme';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Routes } from '@/src/common/constants/routes';

function PlaceholderLogo() {
  return (
    <View
      style={[
        Atoms.rounded_lg,
        Atoms.items_center,
        Atoms.justify_center,
        Atoms.mb_lg,
        {
          width: 100,
          height: 100,
          borderWidth: 2,
          borderColor: 'rgba(255, 255, 255, 0.2)',
          borderStyle: 'dashed',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
        },
      ]}
    >
      <Text variant="small" color="neutral_500">
        LOGO
      </Text>
    </View>
  );
}

export default function OnboardingWelcomeScreen() {
  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View
          style={[
            Atoms.flex_col,
            Atoms.justify_between,
            Atoms.mx_lg,
            Atoms.h_full,
          ]}
        >
          <View
            style={[Atoms.flex_1, Atoms.justify_center, Atoms.items_center]}
          >
            <PlaceholderLogo />
            <View style={Atoms.items_center}>
              <Text variant="title" color="neutral_1000">
                Polycentric
              </Text>
              <Text variant="body" color="neutral_500">
                Law without governance
              </Text>
            </View>
          </View>
          <View style={Atoms.gap_md}>
            <Button
              title="Create new identity"
              variant="primary"
              fullWidth
              onPress={() => router.push(Routes.onboarding.signup.setUsername)}
            />
            <Button
              title="Pair existing identity"
              variant="tertiary"
              fullWidth
              onPress={() => router.push('/(onboarding)/login')}
            />
          </View>
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
