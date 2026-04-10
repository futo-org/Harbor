import { Screen, Box, Text, Button } from '@/src/common/components';
import { Atoms } from '@/src/common/theme';
import { router } from 'expo-router';
import { Routes } from '@/src/common/constants/routes';

function PlaceholderLogo() {
  return (
    <Box
      width={100}
      height={100}
      style={[
        Atoms.rounded_lg,
        Atoms.items_center,
        Atoms.justify_center,
        Atoms.mb_lg,
        {
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
    </Box>
  );
}

export default function OnboardingWelcomeScreen() {
  return (
    <Screen>
      <Box
        style={[
          Atoms.flex_col,
          Atoms.justify_between,
          Atoms.mx_lg,
          Atoms.h_full,
        ]}
      >
        <Box style={[Atoms.flex_1, Atoms.justify_center, Atoms.items_center]}>
          <PlaceholderLogo />
          <Box style={Atoms.items_center}>
            <Text variant="title" color="neutral_1000">
              Polycentric
            </Text>
            <Text variant="body" color="neutral_500">
              Law without governance
            </Text>
          </Box>
        </Box>
        <Box style={Atoms.gap_md}>
          <Button
            title="Create new identity"
            variant="primary"
            fullWidth
            onPress={() => router.push(Routes.onboarding.signup.setUsername)}
          />
          <Button
            title="Import existing identity"
            variant="tertiary"
            fullWidth
            onPress={() => {}}
          />
        </Box>
      </Box>
    </Screen>
  );
}
