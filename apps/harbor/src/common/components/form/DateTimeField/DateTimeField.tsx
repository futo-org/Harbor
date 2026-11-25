import { Atoms, BorderRadius, useTheme } from '@/src/common/theme';
import { isAndroid } from '@/src/common/util/platform';
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { Pressable, View } from 'react-native';
import { Text } from '../../primitives';
import {
  type DateTimeMode,
  formatValue,
  fromDate,
  toDate,
} from './lib/date-time-value';

export type DateTimeFieldProps = {
  mode: DateTimeMode;
  /** YYYY-MM-DD or HH:MM. Empty when unset */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  testID?: string;
};

/** Date or time field using the native picker */
export function DateTimeField({
  mode,
  value,
  onChange,
  placeholder,
  disabled = false,
  testID,
}: DateTimeFieldProps) {
  const { theme } = useTheme();

  const box = [
    Atoms.border,
    { borderRadius: BorderRadius.md },
    theme.atoms.outline,
    disabled && Atoms.faded,
  ];

  // iOS picker always shows a value, so only render it once we have one
  if (!isAndroid && value) {
    return (
      <View style={[box, Atoms.items_start, { padding: 6 }]}>
        <DateTimePicker
          testID={testID}
          mode={mode}
          display="compact"
          value={toDate(mode, value)}
          disabled={disabled}
          themeVariant={theme.scheme}
          accentColor={theme.colors.accent}
          onValueChange={(_event, date) => onChange(fromDate(mode, date))}
        />
      </View>
    );
  }

  const onPress = () => {
    if (!isAndroid) {
      onChange(fromDate(mode, new Date()));
      return;
    }

    DateTimePickerAndroid.open({
      mode,
      value: toDate(mode, value),
      is24Hour: true,
      onValueChange: (_event, date) => onChange(fromDate(mode, date)),
    });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={placeholder}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={[box, { padding: 12 }]}
    >
      <Text variant="body" color={value ? 'primary' : 'muted'}>
        {value ? formatValue(mode, value) : placeholder}
      </Text>
    </Pressable>
  );
}
