import { View } from 'react-native';
import { Atoms, useTheme } from '../../theme';
import { InfoTooltip } from '../InfoTooltip';
import { Text } from '../primitives';

// A list section header row, with an optional explanatory tooltip.
export function SectionHeader({
  title,
  tooltip,
}: {
  title: string;
  tooltip?: string;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.gap_xs,
        Atoms.px_lg,
        Atoms.pt_xl,
        Atoms.pb_sm,
      ]}
    >
      <Text
        variant="small"
        style={theme.atoms.text_neutral_medium}
        fontWeight="semibold"
      >
        {title}
      </Text>
      {tooltip ? <InfoTooltip text={tooltip} size={14} /> : null}
    </View>
  );
}
