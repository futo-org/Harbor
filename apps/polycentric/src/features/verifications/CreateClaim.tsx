import { Text } from '@/src/common/components';
import { Atoms, useTheme } from '@/src/common/theme';
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useAnimatedRef,
} from 'react-native-reanimated';
import { ClaimForm } from './ClaimForm';
import { CLAIM_TYPES, ClaimType } from './utils/forms';
import { PlatformPicker } from './PlatformPicker';
import { SelectChip } from './SelectChip';
import { useScrollIntoView } from './VerificationsScrollContext';

export function CreateClaim({ onSubmitted }: { onSubmitted?: () => void }) {
  const { theme } = useTheme();
  const [selectedClaimType, setSelectedClaimType] =
    useState<ClaimType['name']>();

  const scrollIntoView = useScrollIntoView();
  const formRef = useAnimatedRef<Animated.View>();
  // Scroll on the layout pass after a selection, not on later relayouts.
  const pendingScroll = useRef(false);

  const selected = useMemo(
    () => CLAIM_TYPES.find((s) => s.name === selectedClaimType),
    [selectedClaimType],
  );

  const onSelectClaimType = (name: ClaimType['name']) => {
    const next = name === selectedClaimType ? undefined : name;
    setSelectedClaimType(next);
    if (next) pendingScroll.current = true;
  };

  const onFormLayout = () => {
    if (!pendingScroll.current) return;
    pendingScroll.current = false;
    scrollIntoView(formRef);
  };

  const handleSubmitted = () => {
    setSelectedClaimType(undefined);
    onSubmitted?.();
  };

  return (
    <View style={Atoms.gap_2xl}>
      {/* Claim-type selector. */}
      <View style={Atoms.gap_sm}>
        <Text
          variant="small"
          style={theme.atoms.text_neutral_medium}
          fontWeight="semibold"
        >
          Claim type
        </Text>
        <View style={[Atoms.flex_row, Atoms.gap_sm, Atoms.flex_wrap]}>
          {CLAIM_TYPES.map((s, i) => (
            <Animated.View
              key={s.name}
              entering={FadeInDown.delay(i * 40).duration(200)}
            >
              <SelectChip
                title={s.name}
                icon={s.icon}
                color={s.color}
                selected={selected?.name === s.name}
                onPress={() => onSelectClaimType(s.name)}
              />
            </Animated.View>
          ))}
        </View>
      </View>

      {/* Keyed so state resets and the enter animation replays per type. */}
      {selected && (
        <Animated.View
          ref={formRef}
          key={selected.name}
          entering={FadeInDown.duration(200)}
          exiting={FadeOutDown.duration(150)}
          onLayout={onFormLayout}
        >
          {selected.platform ? (
            <PlatformPicker />
          ) : (
            <ClaimForm claimType={selected} onSubmitted={handleSubmitted} />
          )}
        </Animated.View>
      )}
    </View>
  );
}
