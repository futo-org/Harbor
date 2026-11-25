import { Atoms, BorderRadius, Spacing, useTheme } from '@/src/common/theme';
import * as DropdownMenuPrimitive from '@rn-primitives/dropdown-menu';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  type PressableProps,
  ScrollView,
  type ScrollViewInstance,
  View,
} from 'react-native';
import DropdownMenu from '../../DropdownMenu';
import Icon from '../../Icon';
import { Text } from '../../primitives';
import { CLEAR_BUTTON_SPACE, ClearButton } from './ClearButton';
import type { DateTimeFieldProps } from './DateTimeField';
import {
  formatValue,
  fromDate,
  monthGrid,
  timeOptions,
  toDate,
} from './lib/date-time-value';

const DAY_SIZE = 36;
const TIME_ROW_HEIGHT = 36;
const TIME_LIST_HEIGHT = TIME_ROW_HEIGHT * 6;
const TIME_LIST_WIDTH = 140;
const TIME_STEP_MINUTES = 15;

/** Date or time field with our own popover. The browser pickers can't be themed */
export function DateTimeField(props: DateTimeFieldProps) {
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger asChild disabled={props.disabled}>
        <Field {...props} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        align="start"
        side="bottom"
        sideOffset={Spacing.xs}
        style={{ minWidth: 0 }}
        // Stop the popover stealing focus back when it closes
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <Picker {...props} />
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}

/** Closes whichever picker is open, so only one shows at a time */
let closeOpenPicker: (() => void) | null = null;

type FieldProps = DateTimeFieldProps & PressableProps;

function Field({
  mode,
  value,
  placeholder,
  disabled = false,
  testID,
  onChange,
  // Props from the dropdown trigger
  ...trigger
}: FieldProps) {
  const { theme } = useTheme();
  const { open, onOpenChange } = DropdownMenuPrimitive.useRootContext();

  // biome-ignore lint/correctness/useExhaustiveDependencies: only as it opens and closes
  useEffect(() => {
    if (!open) return;

    closeOpenPicker?.();
    const close = () => onOpenChange(false);
    closeOpenPicker = close;

    return () => {
      if (closeOpenPicker === close) closeOpenPicker = null;
    };
  }, [open]);

  const canClear = !!value && !disabled;

  return (
    <View>
      <Pressable
        {...trigger}
        accessibilityLabel={placeholder}
        testID={testID}
        disabled={disabled}
        style={[
          Atoms.flex_row,
          Atoms.align_center,
          Atoms.gap_sm,
          Atoms.border,
          { borderRadius: BorderRadius.md, padding: 12 },
          open ? theme.atoms.outline_strong : theme.atoms.outline,
          disabled && Atoms.faded,
          canClear && { paddingRight: CLEAR_BUTTON_SPACE },
        ]}
      >
        <Icon
          name={mode === 'date' ? 'calendar' : 'time'}
          size={20}
          color="muted"
        />
        <Text
          variant="body"
          color={value ? 'primary' : 'muted'}
          numberOfLines={1}
          selectable={false}
          style={Atoms.flex_shrink_1}
        >
          {value ? formatValue(mode, value) : placeholder}
        </Text>
      </Pressable>
      {canClear ? (
        <ClearButton
          onPress={() => onChange('')}
          testID={testID ? `${testID}-clear` : undefined}
        />
      ) : null}
    </View>
  );
}

function Picker({ mode, value, onChange }: DateTimeFieldProps) {
  const { onOpenChange } = DropdownMenuPrimitive.useRootContext();

  const choose = (next: string) => {
    onChange(next);
    onOpenChange(false);
  };

  return mode === 'date' ? (
    <Calendar value={value} onChoose={choose} />
  ) : (
    <TimeList value={value} onChoose={choose} />
  );
}

/** First day of the week for the locale. 0 = Sunday */
function firstDayOfWeek(): number {
  try {
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
      weekInfo?: { firstDay: number };
      getWeekInfo?: () => { firstDay: number };
    };

    const info = locale.getWeekInfo?.() ?? locale.weekInfo;
    // Intl uses 1 = Monday, 7 = Sunday
    return info ? info.firstDay % 7 : 1;
  } catch {
    return 1;
  }
}

type CalendarProps = {
  value: string;
  onChoose: (value: string) => void;
};

function Calendar({ value, onChoose }: CalendarProps) {
  const { theme } = useTheme();
  const today = fromDate('date', new Date());

  const [shown, setShown] = useState(() => {
    const date = toDate('date', value);
    return { year: date.getFullYear(), month: date.getMonth() };
  });

  const firstDay = useMemo(firstDayOfWeek, []);

  const step = (months: number) => {
    const date = new Date(shown.year, shown.month + months, 1);
    setShown({ year: date.getFullYear(), month: date.getMonth() });
  };

  // 4 Jan 1970 was a Sunday
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Date(1970, 0, 4 + ((firstDay + index) % 7)).toLocaleDateString(
      undefined,
      { weekday: 'narrow' },
    ),
  );

  return (
    <View style={[Atoms.p_md, Atoms.gap_sm, Atoms.items_center]}>
      <View
        style={[
          Atoms.flex_row,
          Atoms.align_center,
          Atoms.justify_between,
          { width: DAY_SIZE * 7 },
        ]}
      >
        <MonthButton
          icon="chevronBack"
          label="Previous month"
          onPress={() => step(-1)}
        />
        <Text variant="secondary" fontWeight="bold" selectable={false}>
          {new Date(shown.year, shown.month, 1).toLocaleDateString(undefined, {
            month: 'long',
            year: 'numeric',
          })}
        </Text>
        <MonthButton
          icon="chevronForward"
          label="Next month"
          onPress={() => step(1)}
        />
      </View>
      <View style={[Atoms.flex_row, Atoms.flex_wrap, { width: DAY_SIZE * 7 }]}>
        {weekdays.map((weekday, index) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: narrow weekday names repeat
            key={index}
            style={[
              Atoms.items_center,
              Atoms.justify_center,
              { width: DAY_SIZE, height: DAY_SIZE },
            ]}
          >
            <Text variant="small" color="muted" selectable={false}>
              {weekday}
            </Text>
          </View>
        ))}
        {monthGrid(shown.year, shown.month, firstDay).map((day, index) => {
          if (day === null) {
            return (
              <View
                // biome-ignore lint/suspicious/noArrayIndexKey: padding cells have no identity
                key={`pad-${index}`}
                style={{ width: DAY_SIZE, height: DAY_SIZE }}
              />
            );
          }
          const date = fromDate('date', new Date(shown.year, shown.month, day));
          const selected = date === value;
          return (
            <Pressable
              key={date}
              accessibilityRole="button"
              accessibilityLabel={formatValue('date', date)}
              aria-selected={selected}
              onPress={() => onChoose(date)}
              style={({ hovered }) => [
                Atoms.items_center,
                Atoms.justify_center,
                Atoms.rounded_full,
                { width: DAY_SIZE, height: DAY_SIZE },
                selected
                  ? theme.atoms.box.accent.bg
                  : hovered && theme.atoms.box.secondary.bg_hover,
                date === today &&
                  !selected && [Atoms.border, theme.atoms.outline_strong],
              ]}
            >
              <Text
                variant="secondary"
                color={selected ? 'light' : 'primary'}
                fontWeight={selected || date === today ? 'bold' : 'regular'}
                selectable={false}
              >
                {day}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

type MonthButtonProps = {
  icon: 'chevronBack' | 'chevronForward';
  label: string;
  onPress: () => void;
};

function MonthButton({ icon, label, onPress }: MonthButtonProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ hovered }) => [
        Atoms.items_center,
        Atoms.justify_center,
        Atoms.rounded_full,
        { width: DAY_SIZE, height: DAY_SIZE },
        hovered && theme.atoms.box.secondary.bg_hover,
      ]}
    >
      <Icon name={icon} size={20} color="primary" />
    </Pressable>
  );
}

type TimeListProps = {
  value: string;
  onChoose: (value: string) => void;
};

function TimeList({ value, onChoose }: TimeListProps) {
  const { theme } = useTheme();
  const options = useMemo(() => timeOptions(TIME_STEP_MINUTES), []);
  const list = useRef<ScrollViewInstance>(null);

  // Scroll to the selected time, or now
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when it opens
  useEffect(() => {
    const around = value || fromDate('time', new Date());
    const index = options.findIndex((option) => option >= around);

    list.current?.scrollTo({
      y: Math.max(0, index - 2) * TIME_ROW_HEIGHT,
      animated: false,
    });
  }, []);

  return (
    <ScrollView
      ref={list}
      style={{ maxHeight: TIME_LIST_HEIGHT, minWidth: TIME_LIST_WIDTH }}
    >
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            aria-selected={selected}
            onPress={() => onChoose(option)}
            style={({ hovered }) => [
              Atoms.justify_center,
              { height: TIME_ROW_HEIGHT, paddingHorizontal: Spacing.md },
              selected
                ? theme.atoms.box.accent.bg
                : hovered && theme.atoms.box.secondary.bg_hover,
            ]}
          >
            <Text
              variant="secondary"
              color={selected ? 'light' : 'primary'}
              fontWeight={selected ? 'bold' : 'regular'}
              selectable={false}
            >
              {formatValue('time', option)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
