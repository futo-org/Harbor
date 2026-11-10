import Icon from '@/src/common/components/Icon';
import { Button, LinkButton, Text } from '@/src/common/components/primitives';
import { Sheet } from '@/src/common/components/sheet';
import { useSettings } from '@/src/common/settings';
import {
  isModerationLabel,
  moderationLabelDescription,
  moderationLabelName,
} from '@/src/common/settings/moderationLabels';
import { Atoms, useTheme } from '@/src/common/theme';
import { IS_STORE_BUILD } from '@/src/common/util/application';
import ModerationSettingsSheet from '@/src/features/settings/ModerationSettingsSheet';
import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { useLabeler } from './useLabeler';
import { useModerationWarningStore } from './useModerationWarningStore';

/**
 * Confirms revealing labelled content, and can stop warning for its labels.
 * Mounted once at the root; opened via `useModerationWarningStore`.
 */
export function ModerationWarningSheet() {
  const { theme } = useTheme();
  const setModeration = useSettings((s) => s.setModeration);
  const request = useModerationWarningStore((s) => s.request);
  const open = useModerationWarningStore((s) => s.open);
  const onClose = useModerationWarningStore((s) => s.close);
  const labels = request?.labels ?? [];
  const identity = request?.identity ?? null;
  const subject = request?.subject ?? 'post';
  const labeler = useLabeler(labels, identity);
  const [always, setAlways] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    if (!open) setAlways(false);
  }, [open]);

  const names = labels
    .map((label) => moderationLabelName(label.value).toLowerCase())
    .join(', ');
  const descriptions = labels
    .map((label) => moderationLabelDescription(label.value))
    .filter((d): d is string => !!d);

  const confirm = () => {
    if (always) {
      const prefs = labels
        .map((label) => label.value)
        .filter(isModerationLabel)
        .map((label) => [label, 'show'] as const);
      setModeration(Object.fromEntries(prefs));
    }
    request?.onConfirm();
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      detents={[0.5]}
      header={<Sheet.Header title="Are you sure?" onClose={onClose} />}
      footer={
        <Sheet.Footer
          left={
            <View style={[Atoms.flex_row, Atoms.gap_md]}>
              <Button variant="tertiary" title="Not now" onPress={onClose} />
              <View style={Atoms.flex_1}>
                <Button
                  title={always ? 'Show' : 'Show once'}
                  fullWidth
                  onPress={confirm}
                />
              </View>
            </View>
          }
        />
      }
    >
      <Sheet.Content style={Atoms.gap_lg}>
        <View
          style={[
            Atoms.flex_row,
            Atoms.align_center,
            Atoms.gap_md,
            Atoms.p_md,
            Atoms.rounded_md,
            { backgroundColor: theme.palette.neutral_25 },
          ]}
        >
          <Icon name="infoOutline" size={24} color="neutral_700" />
          <View style={[Atoms.flex_1, Atoms.gap_2xs]}>
            <Text fontWeight="bold" color="neutral_700">
              Hidden for {names}
            </Text>
            {descriptions.map((description) => (
              <Text key={description} variant="secondary" color="neutral_500">
                {description}
              </Text>
            ))}
            {labeler ? (
              <Text variant="small" color="neutral_500">
                {!labeler.isSubject
                  ? `Applied by ${labeler.name}`
                  : subject === 'post'
                    ? 'Applied by the author'
                    : 'Applied by the identity itself'}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={Atoms.gap_xs}>
          {/* Store installs keep their content policy. */}
          {IS_STORE_BUILD ? null : (
            <View
              style={[
                Atoms.flex_row,
                Atoms.align_center,
                Atoms.justify_between,
                Atoms.gap_md,
              ]}
            >
              <Text variant="secondary" color="neutral_500">
                Always show{' '}
                <Text variant="secondary" color="neutral_500" fontWeight="bold">
                  {names}
                </Text>
              </Text>
              <Switch
                value={always}
                onValueChange={setAlways}
                accessibilityLabel="Always show"
              />
            </View>
          )}
          <LinkButton
            title="Change your moderation settings"
            variant="secondary"
            color="neutral_500"
            fontWeight="regular"
            underlineOnHover
            containerStyle={Atoms.self_start}
            onPress={() => setSettingsOpen(true)}
          />
        </View>
      </Sheet.Content>
      <ModerationSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </Sheet>
  );
}
