import Icon, { IconName } from '@/src/common/components/Icon';
import {
  Atoms,
  PaletteColorToken,
  useTheme,
  withHexOpacity,
} from '@/src/common/theme';
import { View } from 'react-native';

export function ChipIcon({
  name,
  color = 'neutral_600',
}: {
  name: IconName;
  color?: PaletteColorToken;
}) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        Atoms.rounded_full,
        Atoms.p_xs,
        { backgroundColor: withHexOpacity(theme.palette[color], '25') },
      ]}
    >
      <Icon name={name} color={color} size={12} />
    </View>
  );
}
