import { Text } from '@/src/common/components';
import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { ScrollView } from '@/src/common/components/ScrollView';
import { Atoms, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { useState } from 'react';
import { View } from 'react-native';
import { CreateClaim } from './CreateClaim';
import { SelectChip } from './SelectChip';

type Mode = 'create' | 'verify';

export default function VerificationsScreen() {
  const { theme } = useTheme();
  const [mode, setMode] = useState<Mode>();

  const select = (next: Mode) =>
    setMode((prev) => (prev === next ? undefined : next));

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <ScrollView
          HeaderComponent={() => (
            <Topbar title="Verifications" left={isWeb ? <></> : undefined} />
          )}
          showsVerticalScrollIndicator={false}
        >
          <View style={[Atoms.p_lg, Atoms.gap_2xl]}>
            <View style={[Atoms.flex_row, Atoms.gap_sm, Atoms.flex_wrap]}>
              <SelectChip
                title="Create a claim"
                icon="addOutline"
                color="primary_500"
                selected={mode === 'create'}
                onPress={() => select('create')}
              />
              <SelectChip
                title="Verify a claim"
                icon="verify"
                color="positive_500"
                selected={mode === 'verify'}
                onPress={() => select('verify')}
              />
            </View>

            {mode === 'create' && <CreateClaim />}

            {mode === 'verify' && (
              <Text variant="body" style={theme.atoms.text_neutral_medium}>
                Coming soon
              </Text>
            )}
          </View>
        </ScrollView>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
