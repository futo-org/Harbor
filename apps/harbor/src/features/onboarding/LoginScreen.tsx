import { Button, Text } from '@/src/common/components/primitives';
import { Atoms } from '@/src/common/theme';
import { useOnboardingLinks } from '@/src/features/onboarding/hooks/useOnboardingLinks';
import { View } from 'react-native';

export default function LoginScreen() {
  const links = useOnboardingLinks();

  return (
    <View style={Atoms.gap_sm}>
      <Text variant="title" style={Atoms.mb_lg}>
        Choose a login method
      </Text>
      <Button
        title="Pair with existing device"
        variant="primary"
        fullWidth
        href={links.pair}
      />
      <Button
        title="Recover using backup"
        variant="tertiary"
        fullWidth
        href={links.recover}
      />
    </View>
  );
}
