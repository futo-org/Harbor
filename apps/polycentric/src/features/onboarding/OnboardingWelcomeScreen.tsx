import { Screen, Text, Button } from '@/src/common/components';
import { Atoms } from '@/src/common/theme';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Routes } from '@/src/common/constants/routes';

import WEB_LOGO from '../../common/assets/images/WebLogo.png';
import { Image } from 'expo-image';

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
            style={[
              Atoms.flex_1,
              Atoms.justify_center,
              Atoms.items_center,
              Atoms.gap_2xl,
            ]}
          >
            <Image
              source={WEB_LOGO}
              contentFit="contain"
              style={{ width: 50, height: 50 }}
            />
            <View style={Atoms.items_center}>
              <Text variant="title" color="neutral_1000">
                Polycentric
              </Text>
              {/* <Text variant="body" color="neutral_500">
                Law without governance
              </Text> */}
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
