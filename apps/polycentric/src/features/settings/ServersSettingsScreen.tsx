import { DismissReason, SheetMenu } from '@/src/common/lib/sheet';
import { router } from 'expo-router';
import {
  IconButton,
  LinkButton,
  Text,
  TextInput,
} from '@/src/common/components';
import { confirm } from '@/src/common/lib/dialogs/alert';
import {
  useCurrentIdentity,
  usePolycentric,
  usePolycentricContext,
} from '@/src/common/lib/polycentric-hooks';
import { SheetHeaderBlock, type DismissSheet } from '@/src/common/lib/sheet';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

export function ServersSettings({
  dismissSheet,
}: {
  dismissSheet: DismissSheet;
}) {
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
    <View>
      <SheetHeaderBlock
        title="Servers"
        onClose={() => void dismissSheet()}
        trailing={
          <View style={{ minWidth: 72, alignItems: 'flex-end' }}>
            <LinkButton
              title={isEditing ? 'Done' : 'Edit'}
              underlineOnHover
              onPress={() => {
                setIsEditing((v) => !v);
                setNewServerUrl('');
              }}
            />
          </View>
        }
      />
      <View style={[Atoms.p_lg, Atoms.gap_lg]}>
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
                      <Ionicons
                        name="remove-circle-outline"
                        size={22}
                        color={theme.palette.negative_500}
                      />
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
                  <Ionicons
                    name="add-circle-outline"
                    size={28}
                    color={
                      newServerUrl.trim()
                        ? theme.palette.primary_500
                        : theme.palette.neutral_500
                    }
                  />
                )}
                onPress={handleAddServer}
              />
            )}
          </View>
        )}
      </View>
    </View>
  );
}

export default function ServersSettingsScreen() {
  return (
    <SheetMenu
      onClose={(reason) => {
        if (reason === DismissReason.UserDismissed) router.back();
      }}
      detents={[0.5, 1]}
      dismissible
      scrollable
    >
      {(dismissSheet) => <ServersSettings dismissSheet={dismissSheet} />}
    </SheetMenu>
  );
}
