import { Atoms, BorderRadius, useTheme } from '@/src/common/theme';
import { isAndroid } from '@/src/common/util/platform';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { Text } from '../../primitives';
import { CLEAR_BUTTON_SPACE, ClearButton } from './ClearButton';
import { DateTimePickerSheet } from './DateTimePickerSheet';
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
  const [open, setOpen] = useState(false);

  const box = [
    Atoms.border,
    { borderRadius: BorderRadius.md },
    theme.atoms.outline,
    disabled && Atoms.faded,
  ];

  const onPress = () => {
    if (!isAndroid) {
      Keyboard.dismiss();
      setOpen(true);
      return;
    }

    DateTimePickerAndroid.open({
      mode,
      value: toDate(mode, value),
      is24Hour: true,
      onValueChange: (_event, date) => onChange(fromDate(mode, date)),
    });
  };

  const canClear = !!value && !disabled;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={placeholder}
        testID={testID}
        disabled={disabled}
        onPress={onPress}
        style={[
          box,
          { padding: 12 },
          canClear && { paddingRight: CLEAR_BUTTON_SPACE },
        ]}
      >
        <Text variant="body" color={value ? 'primary' : 'muted'}>
          {value ? formatValue(mode, value) : placeholder}
        </Text>
      </Pressable>
      {canClear ? (
        <ClearButton
          onPress={() => onChange('')}
          testID={testID ? `${testID}-clear` : undefined}
        />
      ) : null}
      {isAndroid ? null : (
        <DateTimePickerSheet
          open={open}
          onClose={() => setOpen(false)}
          mode={mode}
          value={value}
          onChange={onChange}
          title={placeholder}
        />
      )}
    </View>
  );
}
