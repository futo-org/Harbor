import { Button } from '@/src/common/components/primitives/Button';
import { Text } from '@/src/common/components/primitives/Text';
import { TextArea } from '@/src/common/components/TextArea';
import { Sheet } from '@/src/common/components/sheet';
import useReportOptions, { type ReportOptions } from './hooks/useReportOptions';
import { ActivityIndicator, View } from 'react-native';
import { Atoms, useTheme } from '@/src/common/theme';
import RadioGroup from '@/src/common/components/form/RadioGroup';
import { useEffect, useState } from 'react';
import useReportAction from './hooks/useReportAction';
import { create } from 'zustand';
import type { v2 } from '@polycentric/react-native-sdk';

export const useReportSheetStore = create<{
  /** Kept after closing so the native dismiss animation has content. */
  eventId: string | null;
  open: boolean;
  openFor: (eventId: string) => void;
  close: () => void;
}>((set) => ({
  eventId: null,
  open: false,
  openFor: (eventId) => set({ eventId, open: true }),
  close: () => set({ open: false }),
}));

export function ReportSheet() {
  const eventId = useReportSheetStore((s) => s.eventId);
  const open = useReportSheetStore((s) => s.open);
  const onClose = useReportSheetStore((s) => s.close);
  const { options } = useReportOptions();
  const { theme } = useTheme();
  const { isPending, submit } = useReportAction();

  // Use empty string to mean "no value" so that the radio group is consistently
  // controlled, since `value=undefined` would leave it uncontrolled.
  // Additiona info just starts empty.
  const [selected, setSelected] = useState<string>('');
  const [additionalInfo, setAdditionalInfo] = useState<string>('');
  const [stage, setStage] = useState<'option' | 'additional'>('option');

  useEffect(() => {
    if (!open) return;
    setStage('option');
    setSelected('');
    setAdditionalInfo('');
  }, [open]);

  const isOption = stage === 'option';

  /** Go to previous stage or close the sheet. */
  const onBackPress = () => {
    if (isOption) onClose();
    else setStage('option');
  };

  const onSubmit = async () => {
    if (!selected || !eventId) return;

    await submit({
      eventId,
      category: Number(selected) as v2.ReportCategory,
      additionalInfo,
    });

    onClose();
  };

  const onNextPress = () => {
    if (isOption) setStage('additional');
    else void onSubmit();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      detents={[0.5, 0.75, 1]}
      header={
        <Sheet.Header
          title={
            isOption ? 'What are you reporting?' : 'Additional information'
          }
          closeIcon={isOption ? undefined : 'chevronBack'}
          disabled={isPending}
          onClose={onBackPress}
        />
      }
      footer={
        <Sheet.Footer
          right={
            isPending ? (
              <ActivityIndicator
                size="small"
                color={theme.colors.accent}
                accessibilityLabel="Posting"
              />
            ) : (
              <Button
                size="sm"
                title={isOption ? 'Next' : 'Submit'}
                onPress={onNextPress}
                disabled={(isOption && !selected) || isPending}
              />
            )
          }
        />
      }
    >
      <Sheet.Content style={[Atoms.gap_md]}>
        {isOption ? (
          <RadioGroup
            value={selected}
            onValueChange={setSelected}
            disabled={isPending}
          >
            <View style={[Atoms.gap_md]}>
              {options.map((option) => (
                <ReportOption key={option.value} option={option} />
              ))}
            </View>
          </RadioGroup>
        ) : (
          <TextArea
            numberOfLines={3}
            placeholder="Please provide any additional information that you think may be helpful."
            value={additionalInfo}
            onChangeText={setAdditionalInfo}
            disabled={isPending}
          />
        )}
      </Sheet.Content>
    </Sheet>
  );
}

function ReportOption({ option }: { option: ReportOptions[string] }) {
  const { theme } = useTheme();

  return (
    <RadioGroup.Item
      value={option.value.toString()}
      style={({ hovered }) => [
        Atoms.flex_row,
        Atoms.items_center,
        Atoms.justify_between,
        Atoms.p_md,
        Atoms.pl_lg,
        Atoms.rounded_md,
        hovered
          ? theme.atoms.box.secondary.bg_hover
          : theme.atoms.box.secondary.bg,
      ]}
    >
      <Text fontWeight="bold">{option.label}</Text>
      <RadioGroup.Indicator />
    </RadioGroup.Item>
  );
}
