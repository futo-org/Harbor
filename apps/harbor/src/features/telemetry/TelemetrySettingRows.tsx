import { ListItem, Text } from '@/src/common/components';
import { Atoms } from '@/src/common/theme';
import { Switch, View } from 'react-native';
import { useErrorQueue } from './hooks/useErrorQueue';
import { useTelemetrySettings } from './hooks/useTelemetrySettings';

function SwitchRow({
  label,
  value,
  onValueChange,
  testID,
}: {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  testID: string;
}) {
  return (
    <ListItem onPress={() => onValueChange(!value)}>
      <View
        style={[
          Atoms.flex_row,
          Atoms.align_center,
          Atoms.justify_between,
          Atoms.pl_xs,
        ]}
      >
        <Text variant="body">{label}</Text>
        <Switch value={value} onValueChange={onValueChange} testID={testID} />
      </View>
    </ListItem>
  );
}

export function ErrorReportsSettingRow() {
  const enabled = useTelemetrySettings((state) => state.errorReportsEnabled);
  const setEnabled = useTelemetrySettings(
    (state) => state.setErrorReportsEnabled,
  );

  const toggle = (next: boolean) => {
    setEnabled(next);
    if (!next) useErrorQueue.getState().clear();
  };

  return (
    <SwitchRow
      label="Share error reports automatically"
      value={enabled}
      onValueChange={toggle}
      testID="error-reports-toggle"
    />
  );
}

export function IncludeIdentitySettingRow() {
  const enabled = useTelemetrySettings((state) => state.includeIdentity);
  const setEnabled = useTelemetrySettings((state) => state.setIncludeIdentity);

  return (
    <SwitchRow
      label="Include my identity in error reports"
      value={enabled}
      onValueChange={setEnabled}
      testID="include-identity-toggle"
    />
  );
}
