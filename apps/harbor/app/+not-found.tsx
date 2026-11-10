import { Button, Screen, Text } from '@/src/common/components';
import { Atoms } from '@/src/common/theme';
import { View } from 'react-native';

// Without this route, expo-router renders its own fallback outside the root
// layout, so the providers never mount and the web boot skeleton never hides
export default function NotFoundScreen() {
  return (
    <Screen pageTitle="Page not found">
      <Screen.PrimaryColumn>
        <View
          style={[
            Atoms.flex_1,
            Atoms.items_center,
            Atoms.justify_center,
            Atoms.p_lg,
            Atoms.gap_lg,
          ]}
        >
          <Text color="neutral_500">This page doesn't exist</Text>
          <Button title="Go home" variant="secondary" href="/" />
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
