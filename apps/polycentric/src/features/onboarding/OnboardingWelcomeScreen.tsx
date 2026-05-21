import { Button, Screen, Text } from '@/src/common/components';
import { Routes } from '@/src/common/constants/routes';
import { Atoms } from '@/src/common/theme';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Image } from 'expo-image';
import WEB_LOGO from '../../common/assets/images/polycentric-logo-with-text.png';

export default function OnboardingWelcomeScreen() {
  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View style={[Atoms.flex_col, Atoms.flex_1, Atoms.mx_lg]}>
          <View
            style={[
              Atoms.flex_1,
              Atoms.justify_center,
              Atoms.items_center,
              Atoms.gap_2xl,
              Atoms.p_3xl,
            ]}
          >
            <Image
              source={WEB_LOGO}
              contentFit="contain"
              style={{
                width: '100%',
                aspectRatio: 1,
              }}
            />
          </View>
          <View style={[Atoms.gap_md, Atoms.w_full, Atoms.mt_auto]}>
            <Button
              title="Create new identity"
              variant="primary"
              fullWidth
              onPress={() =>
                router.push(Routes.onboarding.signup.setDisplayName)
              }
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
