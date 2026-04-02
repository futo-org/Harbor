import { Screen, Box, Text, Button } from '@/src/common/components';
import { useRouter } from 'expo-router';
import { Routes } from '@/src/common/constants/routes';

function PlaceholderLogo() {
  return (
    <Box
      width={100}
      height={100}
      borderRadius="lg"
      alignItems="center"
      justifyContent="center"
      marginBottom="lg"
      style={{
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        borderStyle: 'dashed',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
      }}
    >
      <Text variant="small" color="neutralSurface">
        LOGO
      </Text>
    </Box>
  );
}

export default function OnboardingWelcomeScreen() {
  const router = useRouter();

  return (
    <Screen background={{ gradient: 'surround' }}>
      <Box
        flexDirection="column"
        justifyContent="space-between"
        marginHorizontal="lg"
        height="100%"
      >
        <Box flex={1} justifyContent="center" alignItems="center">
          <PlaceholderLogo />
          <Box alignItems="center">
            <Text variant="title" color="text">
              Polycentric
            </Text>
            <Text variant="body" color="neutralSurface">
              Law without governance
            </Text>
          </Box>
        </Box>
        <Box gap="md">
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
