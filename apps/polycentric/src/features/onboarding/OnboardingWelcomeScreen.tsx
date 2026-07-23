import { Button, Screen } from '@/src/common/components';
import { AppFooter } from '@/src/common/components/layout';
import { Routes } from '@/src/common/constants/routes';
import { Atoms, themes, useTheme, ZIndex } from '@/src/common/theme';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Image } from 'expo-image';
import HARBOR_LOGO from '../../common/assets/images/harbor-logo-with-text.png';
import LOGO_WITH_TEXT from '../../common/assets/images/harbor-scene-splash.svg';

export default function OnboardingWelcomeScreen() {
  const { theme } = useTheme();
  return (
    // <Screen showLeftSidebar={false}>
    //   <Screen.PrimaryColumn>
    <View style={[Atoms.flex_col, Atoms.flex_1]}>
      <View
        // Absolute column to vertically center the logo
        // (not offset by the buttons)
        style={[
          Atoms.absolute,
          Atoms.w_full,
          Atoms.p_2xl,
          Atoms.flex_1,
          Atoms.justify_center,
          Atoms.items_center,
          // Keeps the logo above the splash image, which renders after it.
          { zIndex: ZIndex.raised },
        ]}
      >
        <Image
          source={HARBOR_LOGO}
          contentFit="contain"
          style={{
            width: 120,
            height: 120,
          }}
        />
      </View>

      <View
        // Absolute column to vertically center the logo
        // (not offset by the buttons)
        style={[
          Atoms.absolute,
          Atoms.inset_0,
          Atoms.justify_center,
          Atoms.items_center,
        ]}
      >
        <Image
          source={LOGO_WITH_TEXT}
          contentFit="cover"
          style={{
            width: '100%',
            height: '100%',
          }}
        />
      </View>
      <View
        style={[
          Atoms.gap_md,
          Atoms.w_full,
          Atoms.mt_auto,
          Atoms.p_lg,
          { backgroundColor: theme.palette.neutral_0 },
        ]}
      >
        <Button
          title="Create new identity"
          variant="primary"
          fullWidth
          onPress={() => router.push(Routes.onboarding.signup.setDisplayName)}
        />
        <Button
          title="Pair existing identity"
          variant="tertiary"
          fullWidth
          onPress={() => router.push('/(onboarding)/login')}
        />
        <AppFooter style={[Atoms.justify_center]} />
      </View>
    </View>
    //   </Screen.PrimaryColumn>
    // </Screen>
  );
}
