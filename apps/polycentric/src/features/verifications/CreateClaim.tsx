import { Text } from '@/src/common/components';
import { Atoms, useTheme } from '@/src/common/theme';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { ClaimForm } from './ClaimForm';
import { CLAIM_TYPES, ClaimType } from './utils/forms';
import { PlatformPicker } from './PlatformPicker';
import { SelectChip } from './SelectChip';

export function CreateClaim({
  onSubmitted,
  onPlatformSelected,
}: {
  onSubmitted?: () => void;
  onPlatformSelected?: () => void;
}) {
  const { theme } = useTheme();
  const [selectedClaimType, setSelectedClaimType] =
    useState<ClaimType['name']>();

  const selected = useMemo(
    () => CLAIM_TYPES.find((s) => s.name === selectedClaimType),
    [selectedClaimType],
  );

  const onSelectClaimType = (name: ClaimType['name']) =>
    setSelectedClaimType(name === selectedClaimType ? undefined : name);

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

      {/* Platform claims pick a platform and link an account. */}
      {selected?.platform && (
        <Animated.View
          entering={FadeInDown.duration(200)}
          exiting={FadeOutDown.duration(150)}
        >
          <PlatformPicker onSelect={onPlatformSelected} />
        </Animated.View>
      )}

      {/* Everything else is a field form. Keyed so state resets per type. */}
      {selected && !selected.platform && (
        <Animated.View
          key={selected.name}
          entering={FadeInDown.duration(200)}
          exiting={FadeOutDown.duration(150)}
        >
          <ClaimForm claimType={selected} onSubmitted={handleSubmitted} />
        </Animated.View>
      )}
    </View>
  );
}
