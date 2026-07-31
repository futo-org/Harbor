import { IconButton, Text } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Sheet } from '@/src/common/components/sheet';
import { Routes } from '@/src/common/constants/routes';
import { Atoms } from '@/src/common/theme';
import useModerationStatus from '@/src/features/moderation/hooks/useModerationStatus';
import { router } from 'expo-router';
import { View } from 'react-native';
import { AddServerForm } from './AddServerForm';
import { ServerRow } from './ServerRow';
import { useServerSettings } from './useServerSettings';

export function ServersSettingsSheet() {
  const {
    servers,
    suggestedServers,
    isBusy,
    addError,
    addServer,
    removeServer,
  } = useServerSettings();
  const { moderatedServers } = useModerationStatus();

  // The dashboard is a route outside this sheet's stack, so close the
  // sheet before pushing it.
  const openModerationDashboard = (server: string) => {
    if (router.canGoBack()) router.back();
    router.push(
      `${Routes.tabs.moderation.dashboard}?server=${encodeURIComponent(
        server,
      )}`,
    );
  };

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
                action="remove"
                onAction={() => removeServer(server)}
                trailing={
                  moderatedServers.includes(server) ? (
                    <IconButton
                      variant="ghost"
                      compact
                      icon={() => (
                        <Icon
                          name="shieldAccount"
                          size={22}
                          color="primary_500"
                        />
                      )}
                      onPress={() => openModerationDashboard(server)}
                    />
                  ) : undefined
                }
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
                action="add"
                onAction={() => addServer(server)}
              />
            ))}
          </View>
        )}

        <AddServerForm isBusy={isBusy} error={addError} onSubmit={addServer} />
      </Sheet.Content>
    </Sheet>
  );
}

export default function ServersSettingsScreen() {
  return <ServersSettingsSheet />;
}
