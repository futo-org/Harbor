import { Atoms, useTheme } from '@/src/common/theme';
import { View } from 'react-native';
import RadioGroup from '../form/RadioGroup';
import Icon, { type IconName } from '../Icon';
import { Text } from '../primitives';
import { Sheet } from '../sheet';

export type TabFilterOption<T extends string> = {
  value: T;
  label: string;
  icon?: IconName;
};

type TabFilterSheetProps<T extends string> = {
  open: boolean;
  onClose: () => void;
  title: string;
  options: readonly TabFilterOption<T>[];
  selected: T;
  onChange: (value: T) => void;
};

/** Sheet configuring what a tab shows, opened by a `menu` tab. */
export function TabFilterSheet<T extends string>({
  open,
  onClose,
  title,
  options,
  selected,
  onChange,
}: TabFilterSheetProps<T>) {
  const { theme } = useTheme();

  return (
    <Sheet open={open} onClose={onClose} detents={[0.3]}>
      <Sheet.Header title={title} onClose={onClose} />
      <Sheet.Content style={Atoms.p_0}>
        <RadioGroup
          value={selected}
          onValueChange={(value) => onChange(value as T)}
        >
          {options.map((option) => (
            <RadioGroup.Item
              key={option.value}
              value={option.value}
              style={({ hovered, pressed }) => [
                Atoms.flex_row,
                Atoms.items_center,
                Atoms.gap_md,
                Atoms.py_lg,
                Atoms.px_lg,
                (hovered || pressed) && {
                  backgroundColor: theme.palette.neutral_25,
                },
              ]}
            >
              {option.icon ? (
                <Icon name={option.icon} size={24} color="neutral_900" />
              ) : null}
              <View style={Atoms.flex_1}>
                <Text variant="title" fontWeight="regular">
                  {option.label}
                </Text>
              </View>
              <RadioGroup.Indicator />
            </RadioGroup.Item>
          ))}
        </RadioGroup>
      </Sheet.Content>
    </Sheet>
  );
}
