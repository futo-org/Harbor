import { Text } from '@/src/common/components';
import { Sheet } from '@/src/common/components/sheet';
import { Atoms } from '@/src/common/theme';
import { router } from 'expo-router';
import { View } from 'react-native';
import { AddServerForm } from './AddServerForm';
import { ServerRow } from './ServerRow';
import { useServerSettings } from './useServerSettings';
import { useCurrentAuthorization } from '@/src/common/lib/polycentric-hooks/useCurrentAuthorization';

export function ServersSettingsSheet() {
  const {
    servers,
    suggestedServers,
    isBusy,
    addError,
    addServer,
    removeServer,
  } = useServerSettings();
  const { canRotate } = useCurrentAuthorization();

  return (
    <Sheet
      detents={[0.5, 1]}
      header={
        <Sheet.Header
          title="Servers"
          onClose={() => router.canGoBack() && router.back()}
        />
      }
      dismissible
    >
      <Sheet.Content style={[Atoms.gap_lg]}>
        {servers.length === 0 ? (
          <Text variant="secondary" color="neutral_500">
            No servers configured
          </Text>
        ) : (
          <View style={Atoms.gap_sm}>
            {servers.map((server) => (
              <ServerRow
                key={server}
                server={server}
                status="active"
                onAction={canRotate ? () => removeServer(server) : undefined}
              />
            ))}
          </View>
        )}

        {suggestedServers.length > 0 && (
          <View style={Atoms.gap_sm}>
            <Text variant="secondary" color="neutral_500">
              Suggested servers
            </Text>
            {suggestedServers.map((server) => (
              <ServerRow
                key={server}
                server={server}
                status="suggested"
                onAction={canRotate ? () => addServer(server) : undefined}
              />
            ))}
          </View>
        )}

        {canRotate ? (
          <AddServerForm
            isBusy={isBusy}
            error={addError}
            onSubmit={addServer}
          />
        ) : null}
      </Sheet.Content>
    </Sheet>
  );
}

export default function ServersSettingsScreen() {
  return <ServersSettingsSheet />;
}
