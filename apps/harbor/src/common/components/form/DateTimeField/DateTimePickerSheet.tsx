import { Spacing, useTheme } from '@/src/common/theme';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../primitives';
import { Sheet } from '../../sheet';
import { type DateTimeMode, fromDate, toDate } from './lib/date-time-value';

type Size = { width: number; height: number };

const MAX_SCALE = 1.3;

// Picker sizes as last measured, so the sheet opens at its final height
const pickerSizes: Record<DateTimeMode, Size> = {
  date: { width: 330, height: 340 },
  time: { width: 330, height: 216 },
};

type DateTimePickerSheetProps = {
  open: boolean;
  onClose: () => void;
  mode: DateTimeMode;
  /** YYYY-MM-DD or HH:MM. Empty when unset */
  value: string;
  onChange: (value: string) => void;
  title?: string;
};

/** iOS sheet holding the date calendar or the time wheels */
export function DateTimePickerSheet({
  open,
  onClose,
  mode,
  value,
  onChange,
  title,
}: DateTimePickerSheetProps) {
  const { theme } = useTheme();
  const current = toDate(mode, value);
  const [width, setWidth] = useState(0);
  const [size, setSize] = useState(pickerSizes[mode]);
  const scale = width ? Math.min(MAX_SCALE, width / size.width) : 1;

  const done = () => {
    if (!value) onChange(fromDate(mode, current));
    onClose();
  };

  const pick = (date: Date) => {
    onChange(fromDate(mode, date));
    // The month and year wheels keep the day, so they leave the sheet open
    if (mode === 'date' && date.getDate() !== current.getDate()) onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      detents={['auto']}
      scrollable={false}
      header={
        <Sheet.Header
          title={title}
          onClose={onClose}
          right={
            <Button title="Done" variant="primary" size="sm" onPress={done} />
          }
        />
      }
    >
      <Sheet.Content
        scrollable={false}
        style={{ paddingTop: 0, paddingBottom: Spacing.sm, minHeight: 0 }}
      >
        <View
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          style={{ height: size.height * scale }}
        >
          {width ? (
            <View
              onLayout={(event) => {
                const { width, height } = event.nativeEvent.layout;
                if (!width || !height) return;
                pickerSizes[mode] = { width, height };
                setSize({ width, height });
              }}
              style={{
                position: 'absolute',
                top: 0,
                left: (width - size.width * scale) / 2,
                transformOrigin: 'top left',
                transform: [{ scale }],
              }}
            >
              <DateTimePicker
                mode={mode}
                display={mode === 'date' ? 'inline' : 'spinner'}
                value={current}
                themeVariant={theme.scheme}
                accentColor={theme.colors.accent}
                onValueChange={(_event, date) => pick(date)}
              />
            </View>
          ) : null}
        </View>
      </Sheet.Content>
    </Sheet>
  );
}
