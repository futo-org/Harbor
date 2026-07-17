import { IconButton, Text, TextInput } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Sheet } from '@/src/common/components/sheet';
import { confirm } from '@/src/common/lib/dialogs/alert';
import {
  useCurrentIdentity,
  usePolycentric,
  usePolycentricContext,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

export function ServersSettingsSheet() {
  const client = usePolycentric();
  const { store } = usePolycentricContext();
  const { identity } = useCurrentIdentity();
  const { theme } = useTheme();

  const [servers, setServers] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [newServerUrl, setNewServerUrl] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const refreshServers = useCallback(() => {
    setServers([...client.servers]);
  }, [client]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-read the server list when the identity switches
  useEffect(() => {
    refreshServers();
  }, [identity, refreshServers]);

  const handleAddServer = async () => {
    const url = newServerUrl.trim();
    if (!url || isBusy) return;
    setIsBusy(true);
    try {
      // TODO: createAddServer not yet available — manually add to servers list
      client.servers.push(url);
      setNewServerUrl('');
      refreshServers();
      store.getState().clearFeed('explore');
      client.sync().catch(() => {});
    } catch (err) {
      console.error('Failed to add server:', err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemoveServer = async (server: string) => {
    const ok = await confirm({
      title: 'Remove Server',
      message: `Remove ${server}?`,
      confirmText: 'Remove',
    });
    if (!ok) return;
    setIsBusy(true);
    try {
      // TODO: Remove server not yet implemented in v2
      console.warn('Remove server not yet implemented in v2');
      refreshServers();
      store.getState().clearFeed('explore');
      client.sync().catch(() => {});
    } catch (err) {
      console.error('Failed to remove server:', err);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Sheet detents={[0.5, 1]} dismissible scrollable>
      {/* TODO: restore the Edit button once servers are part of the Identity document. */}
      <Sheet.Header
        title="Servers"
        onClose={() => router.canGoBack() && router.back()}
      />
      <Sheet.Content style={[Atoms.gap_lg]}>
        {servers.length === 0 ? (
          <Text variant="secondary" color="neutral_500">
            No servers configured
          </Text>
        ) : (
          <View style={Atoms.gap_sm}>
            {servers.map((server) => (
              <View
                key={server}
                style={[
                  Atoms.flex_row,
                  Atoms.justify_between,
                  Atoms.items_center,
                  Atoms.p_md,
                  Atoms.rounded_md,
                  {
                    backgroundColor: withHexOpacity(
                      theme.palette.neutral_500,
                      '20',
                    ),
                  },
                ]}
              >
                <Text
                  variant="secondary"
                  style={{ fontFamily: 'monospace', flex: 1 }}
                  numberOfLines={1}
                >
                  {server}
                </Text>
                {isEditing && (
                  <IconButton
                    variant="ghost"
                    compact
                    icon={() => (
                      <Icon name="remove" size={22} color="negative_500" />
                    )}
                    onPress={() => handleRemoveServer(server)}
                  />
                )}
              </View>
            ))}
          </View>
        )}

        {isEditing && (
          <View style={[Atoms.flex_row, Atoms.gap_sm, Atoms.items_center]}>
            <View style={Atoms.flex_1}>
              <TextInput
                placeholder="https://server.example.com"
                value={newServerUrl}
                onChangeText={setNewServerUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>
            {isBusy ? (
              <ActivityIndicator accessibilityLabel="Adding server" />
            ) : (
              <IconButton
                variant="ghost"
                icon={() => (
                  <Icon
                    name="addOutline"
                    size={28}
                    color={newServerUrl.trim() ? 'primary_500' : 'neutral_500'}
                  />
                )}
                onPress={handleAddServer}
              />
            )}
          </View>
        )}
      </Sheet.Content>
    </Sheet>
  );
}

export default function ServersSettingsScreen() {
  return <ServersSettingsSheet />;
}
