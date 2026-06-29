import { Text } from '@/src/common/components';
import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { type ListRef } from '@/src/common/components/List';
import { Atoms, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { useCallback, useRef } from 'react';
import { View } from 'react-native';
import { ClaimCreate } from './claims/ClaimCreate';
import { ClaimList } from './claims/ClaimList';
import { SelectChip } from './SelectChip';
import { VerificationsScrollProvider } from './VerificationsScrollContext';
import {
  useVerificationsStore,
  VerificationScreenMode,
} from './hooks/useVerificationsStore';

export default function VerificationsScreen() {
  const { theme } = useTheme();
  const mode = useVerificationsStore((s) => s.mode);
  const setMode = useVerificationsStore((s) => s.setMode);
  const listRef = useRef<ListRef>(null);

  const select = (next: VerificationScreenMode) =>
    setMode(mode === next ? undefined : next);

  // The create flow rides in the list header at the top, so revealing a
  // freshly shown section is just scrolling the list back to the top.
  const scrollToForm = useCallback(() => listRef.current?.scrollToTop(), []);

  const header = (
    <View
      style={[
        Atoms.p_lg,
        Atoms.gap_2xl,
        {
          borderBottomColor: theme.palette.neutral_25,
          borderBottomWidth: 4,
        },
      ]}
    >
      <View style={[Atoms.flex_row, Atoms.gap_sm, Atoms.flex_wrap]}>
        <SelectChip
          title="Create a claim"
          icon="addOutline"
          color="primary_500"
          selected={mode === 'claim'}
          onPress={() => select('claim')}
        />
        <SelectChip
          title="Verify a claim"
          icon="verify"
          color="positive_500"
          selected={mode === 'verify'}
          onPress={() => select('verify')}
        />
      </View>

      {mode === 'claim' && (
        <VerificationsScrollProvider value={scrollToForm}>
          <ClaimCreate onSubmitted={() => setMode(undefined)} />
        </VerificationsScrollProvider>
      )}

      {mode === 'verify' && (
        <Text variant="body" style={theme.atoms.text_neutral_medium}>
          Coming soon
        </Text>
      )}
    </View>
  );

  return (
    <Screen keyboardAvoiding>
      <Screen.PrimaryColumn>
        <ClaimList
          ref={listRef}
          HeaderComponent={() => (
            <Topbar title="Verifications" left={isWeb ? <></> : undefined} />
          )}
          ListHeaderComponent={header}
        />
      </Screen.PrimaryColumn>
    </Screen>
  );
}
