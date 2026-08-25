import { Button, Text } from '@/src/common/components/primitives';
import { RETURN_TO_PARAM, Routes, safeReturnTo } from '@/src/common/constants';
import { Atoms } from '@/src/common/theme';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

export default function LoginScreen() {
  const returnTo = safeReturnTo(
    useLocalSearchParams()[RETURN_TO_PARAM] as string | undefined,
  );

  /** Ensure a route passes along the `returnTo` param */
  const to = <T extends string>(pathname: T) => {
    return returnTo
      ? { pathname, params: { [RETURN_TO_PARAM]: returnTo } }
      : pathname;
  };

  return (
    <View style={Atoms.gap_sm}>
      <Text variant="title" style={Atoms.mb_lg}>
        Choose a login method
      </Text>
      <Button
        title="Pair with existing device"
        variant="primary"
        fullWidth
        href={to(Routes.onboarding.pair)}
      />
      <Button
        title="Recover using backup"
        variant="tertiary"
        fullWidth
        href={to(Routes.onboarding.recover)}
      />
    </View>
  );
}
