import { Text } from '@/src/common/components';
import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { ScrollView } from '@/src/common/components/ScrollView';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { CreateClaim } from './CreateClaim';
import { SelectChip } from './SelectChip';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Mode = 'create' | 'verify';

export default function VerificationsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>();
  const scrollRef = useRef<Animated.ScrollView>(null);
  // Set when something below the fold is revealed; the scroll happens once the
  // content actually grows (see onContentSizeChange), so we measure the new
  // height rather than the old one.
  const pendingScroll = useRef(false);

  const select = (next: Mode) =>
    setMode((prev) => (prev === next ? undefined : next));

  const scrollToBottom = () => {
    pendingScroll.current = true;
  };

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <ScrollView
          ref={scrollRef}
          HeaderComponent={() => (
            <Topbar title="Verifications" left={isWeb ? <></> : undefined} />
          )}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            if (!pendingScroll.current) return;
            pendingScroll.current = false;
            scrollRef.current?.scrollToEnd({ animated: true });
          }}
        >
          <View
            style={[
              Atoms.p_lg,
              Atoms.gap_2xl,
              {
                paddingBottom: insets.bottom + Spacing['lg'],
              },
            ]}
          >
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

            {mode === 'create' && (
              <CreateClaim onPlatformSelected={scrollToBottom} />
            )}

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
