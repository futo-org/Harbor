import { Button, Text } from '@/src/common/components/primitives';
import { AppFooter } from '@/src/common/components/layout';
import { Routes } from '@/src/common/constants/routes';
import { useIsStoragePersistent } from '@/src/common/lib/polycentric-hooks';
import { Atoms, Spacing, useTheme, ZIndex } from '@/src/common/theme';
import { PRIVATE_BROWSING_NOTICE } from '@/src/features/core/identity/SignupWidget';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Image } from 'expo-image';
import HARBOR_LOGO from '../../common/assets/images/harbor-logo-with-text.png';
import LOGO_WITH_TEXT from '../../common/assets/images/harbor-scene-splash.svg';

export default function OnboardingWelcomeScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const isStoragePersistent = useIsStoragePersistent();
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
          { paddingTop: insets.top + Spacing['2xl'] },
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
          {
            backgroundColor: theme.palette.neutral_0,
            paddingBottom: insets.bottom + Spacing.lg,
          },
        ]}
      >
        {isStoragePersistent ? (
          <>
            <Button
              title="Create new identity"
              variant="primary"
              fullWidth
              href={Routes.onboarding.signup.index}
            />
            <Button
              title="Pair existing identity"
              variant="tertiary"
              fullWidth
              href={Routes.onboarding.login}
            />
            <Button
              title="Recover using backup"
              variant="tertiary"
              fullWidth
              href={Routes.onboarding.recover}
            />
          </>
        ) : (
          <Text variant="small" color="neutral_500" style={Atoms.text_center}>
            {PRIVATE_BROWSING_NOTICE}
          </Text>
        )}
        <AppFooter style={[Atoms.justify_center]} />
      </View>
    </View>
    //   </Screen.PrimaryColumn>
    // </Screen>
  );
}
