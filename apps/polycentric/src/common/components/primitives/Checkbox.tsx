import { Pressable, View } from 'react-native';
import Icon from '@/src/common/components/Icon';
import { Atoms, useTheme } from '@/src/common/theme';
import { Text } from './Text';

const SIZE = 22;

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={() => {
        if (!disabled) onChange(!checked);
      }}
      style={({ pressed }) => [
        Atoms.flex_row,
        Atoms.items_center,
        Atoms.self_start,
        Atoms.gap_md,
        { opacity: disabled ? 0.5 : pressed ? 0.7 : 1 },
      ]}
    >
      <View
        style={[
          Atoms.items_center,
          Atoms.justify_center,
          Atoms.rounded_sm,
          {
            width: SIZE,
            height: SIZE,
            borderWidth: 2,
            ...(checked
              ? {
                  backgroundColor: theme.palette.primary_500,
                  borderColor: theme.palette.primary_500,
                }
              : { borderColor: theme.palette.neutral_300 }),
          },
        ]}
      >
        {checked ? <Icon name="checkmark" size={16} color="neutral_0" /> : null}
      </View>
      <Text variant="body">{label}</Text>
    </Pressable>
  );
}
