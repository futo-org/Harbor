import { Text } from '@/src/common/components';
import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { ScrollView } from '@/src/common/components/ScrollView';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { type Ref, useCallback } from 'react';
import { View } from 'react-native';
import Animated, {
  type AnimatedRef,
  measure,
  scrollTo,
  useAnimatedRef,
  useScrollOffset,
} from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';
import { ClaimCreate } from './claims/ClaimCreate';
import { ClaimList } from './claims/ClaimList';
import { SelectChip } from './SelectChip';
import { VerificationsScrollProvider } from './VerificationsScrollContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useVerificationsStore,
  VerificationScreenMode,
} from './hooks/useVerificationsStore';

const MARGIN = Spacing.lg;

export default function VerificationsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const mode = useVerificationsStore((s) => s.mode);
  const setMode = useVerificationsStore((s) => s.setMode);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollOffset(scrollRef);

  const select = (next: VerificationScreenMode) =>
    setMode(mode === next ? undefined : next);

  // Align a revealed form section to the top of the viewport.
  const scrollIntoView = useCallback(
    (target: AnimatedRef<Animated.View>) => {
      scheduleOnUI(() => {
        'worklet';
        const el = measure(target);
        const scroll = measure(scrollRef);
        if (el === null || scroll === null) return;
        const y = scrollOffset.value + el.pageY - scroll.pageY - MARGIN;
        scrollTo(scrollRef, 0, Math.max(0, y), true);
      });
    },
    [scrollRef, scrollOffset],
  );

  return (
    <Screen keyboardAvoiding>
      <Screen.PrimaryColumn>
        <ScrollView
          // useAnimatedRef works as a ref at runtime but isn't typed as one.
          ref={scrollRef as Ref<Animated.ScrollView>}
          HeaderComponent={() => (
            <Topbar title="Verifications" left={isWeb ? <></> : undefined} />
          )}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              Atoms.gap_2xl,
              {
                paddingBottom: insets.bottom + Spacing['lg'],
              },
            ]}
          >
            <View style={[Atoms.p_lg, Atoms.gap_2xl]}>
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
                <VerificationsScrollProvider value={scrollIntoView}>
                  <ClaimCreate onSubmitted={() => setMode(undefined)} />
                </VerificationsScrollProvider>
              )}

              {mode === 'verify' && (
                <Text variant="body" style={theme.atoms.text_neutral_medium}>
                  Coming soon
                </Text>
              )}
            </View>
            {/* Resting state: the current identity's created claims. */}
            {!mode && <ClaimList />}
          </View>
        </ScrollView>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
