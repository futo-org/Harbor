import { Atoms } from '@/src/common/theme';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SelectChip } from '../SelectChip';
import { type Platform, PLATFORMS } from '../utils/platforms';

// The grid of platforms a claim can be verified against.
export function ClaimCreatePlatformPicker({
  onSelect,
}: {
  onSelect: (platform: Platform) => void;
}) {
  return (
    <View style={[Atoms.flex_row, Atoms.gap_sm, Atoms.flex_wrap]}>
      {PLATFORMS.map((platform, i) => (
        <Animated.View
          key={platform.name}
          entering={FadeInDown.delay(i * 40).duration(200)}
        >
          <SelectChip
            title={platform.name}
            icon={platform.logo}
            color={platform.color}
            onPress={() => onSelect(platform)}
          />
        </Animated.View>
      ))}
    </View>
  );
}
