import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
} from 'react-native';
import { types } from '@polycentric/react-native';
import type { PolycentricClient } from '@polycentric/react-native';
import {
  usePolycentricContext,
  useCurrentIdentity,
  pubkeyStr,
  getIdentityId,
  identiconUrl,
} from '../hooks';
import { COLORS } from '../colors';

const DEFAULT_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const DEFAULT_SERVER =
  (process.env.POLYCENTRIC_SERVER ?? '').trim() ||
  `http://${DEFAULT_HOST}:8081`;

interface UserProfile {
  publicKey: types.IPublicKey;
  pubkeyShort: string;
  username: string;
  avatarUrl?: string;
}

async function buildProfileForKey(
  client: PolycentricClient,
  pubkey: types.IPublicKey
): Promise<UserProfile> {
  const short = getIdentityId(pubkey);
  const avatarUrl = identiconUrl(pubkey);

  let username = short;
  try {
    const name = await client.queryManager.queryUsername(pubkey);
    if (name) username = name;
  } catch {}

  return { publicKey: pubkey, pubkeyShort: short, username, avatarUrl };
}

export function SettingsView() {
  const { client } = usePolycentricContext();
  const { identity, switchIdentity } = useCurrentIdentity();

  const [configuredServers, setConfiguredServers] = useState<string[]>(() =>
    client.queryManager.queryServers(client.currentSystem)
  );
  const [editingServers, setEditingServers] = useState(false);
  const [newServerUrl, setNewServerUrl] = useState('');
  const [serverBusy, setServerBusy] = useState(false);

  const refreshServers = useCallback(() => {
    setConfiguredServers(
      client.queryManager.queryServers(client.currentSystem)
    );
  }, [client]);

  // Refresh servers when identity changes
  useEffect(() => {
    refreshServers();
  }, [identity, refreshServers]);

  const handleAddServer = async () => {
    const url = newServerUrl.trim();
    if (!url || serverBusy) return;
    setServerBusy(true);
    try {
      await client.addServer(url);
      await client.sync();
      setNewServerUrl('');
      refreshServers();
    } catch (err) {
      console.error('Failed to add server:', err);
    } finally {
      setServerBusy(false);
    }
  };

  const handleRemoveServer = (server: string) => {
    Alert.alert('Remove Server', `Remove ${server}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setServerBusy(true);
          try {
            await client.contentManager.createRemoveServer(server);
            await client.sync();
            refreshServers();
          } catch (err) {
            console.error('Failed to remove server:', err);
          } finally {
            setServerBusy(false);
          }
        },
      },
    ]);
  };

  const [editingIdentity, setEditingIdentity] = useState(false);
  const [identityBusy, setIdentityBusy] = useState(false);
  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);

  const refreshIdentities = useCallback(async () => {
    const allKeys = client.getAllIdentities();
    const profiles = await Promise.all(
      allKeys.map((kp) => buildProfileForKey(client, kp.publicKey))
    );
    setAllProfiles(profiles);
  }, [client]);

  useEffect(() => {
    refreshIdentities();
  }, [refreshIdentities, identity]);

  // Build current user profile from allProfiles
  const currentPubStr = identity ? pubkeyStr(identity.keyPair.publicKey) : '';
  const currentUser = allProfiles.find(
    (p) => pubkeyStr(p.publicKey) === currentPubStr
  );
  const otherIdentities = allProfiles.filter(
    (p) => pubkeyStr(p.publicKey) !== currentPubStr
  );

  const handleSwitchIdentity = async (pubkey: UserProfile['publicKey']) => {
    if (identityBusy) return;
    setIdentityBusy(true);
    try {
      await switchIdentity(pubkey);
      refreshServers();
    } catch (err) {
      console.error('Failed to switch identity:', err);
    } finally {
      setIdentityBusy(false);
    }
  };

  const handleNewIdentity = async () => {
    if (identityBusy) return;
    setIdentityBusy(true);
    try {
      await client.createIdentity(DEFAULT_SERVER);
      await client.sync().catch(() => {});
      refreshServers();
    } catch (err) {
      console.error('Failed to create identity:', err);
    } finally {
      setIdentityBusy(false);
    }
  };

  const handleDeleteIdentity = () => {
    const allKeys = client.getAllIdentities();
    const isLast = allKeys.length <= 1;
    const message = isLast
      ? 'This is your only identity. Deleting it will create a new empty one.'
      : 'Delete this identity? The app will switch to another one.';

    Alert.alert('Delete Identity', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setIdentityBusy(true);
          try {
            await client.deleteIdentity();
            if (!client.hasIdentity()) {
              await client.createIdentity(DEFAULT_SERVER);
              await client.sync().catch(() => {});
            }
            refreshServers();
            setEditingIdentity(false);
          } catch (err) {
            console.error('Failed to delete identity:', err);
          } finally {
            setIdentityBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.section}>
        {/* Servers */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Servers</Text>
          <TouchableOpacity
            onPress={() => {
              setEditingServers(!editingServers);
              setNewServerUrl('');
            }}
          >
            <Text style={styles.editLink}>
              {editingServers ? 'Done' : 'Edit'}
            </Text>
          </TouchableOpacity>
        </View>
        {configuredServers.length === 0 ? (
          <Text style={styles.emptyText}>No servers configured</Text>
        ) : (
          <View style={styles.serverList}>
            {configuredServers.map((server) => (
              <View key={server} style={styles.serverRow}>
                <Text style={styles.serverUrl}>{server}</Text>
                {editingServers && (
                  <TouchableOpacity
                    onPress={() => handleRemoveServer(server)}
                    disabled={serverBusy}
                    style={styles.serverRemoveButton}
                  >
                    <Text style={styles.serverRemoveText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}
        {editingServers && (
          <View style={styles.addServerRow}>
            <TextInput
              style={styles.addServerInput}
              value={newServerUrl}
              onChangeText={setNewServerUrl}
              placeholder="https://server.example.com"
              placeholderTextColor={COLORS.inkSubtle}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <TouchableOpacity
              style={[
                styles.addServerButton,
                (!newServerUrl.trim() || serverBusy) &&
                  styles.addServerButtonDisabled,
              ]}
              onPress={handleAddServer}
              disabled={!newServerUrl.trim() || serverBusy}
            >
              {serverBusy ? (
                <ActivityIndicator size="small" color={COLORS.inkBold} />
              ) : (
                <Text style={styles.addServerButtonText}>Add</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Identity */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Identity</Text>
          <TouchableOpacity
            onPress={() => setEditingIdentity(!editingIdentity)}
          >
            <Text style={styles.editLink}>
              {editingIdentity ? 'Done' : 'Edit'}
            </Text>
          </TouchableOpacity>
        </View>

        {currentUser && <IdentityCard user={currentUser} isCurrent />}

        {editingIdentity && (
          <TouchableOpacity
            style={styles.deleteIdentityButton}
            onPress={handleDeleteIdentity}
            disabled={identityBusy}
          >
            {identityBusy ? (
              <ActivityIndicator size="small" color="#ff4444" />
            ) : (
              <Text style={styles.deleteIdentityText}>Delete Identity</Text>
            )}
          </TouchableOpacity>
        )}

        {otherIdentities.map((user) => (
          <TouchableOpacity
            key={user.pubkeyShort}
            onPress={() => handleSwitchIdentity(user.publicKey)}
            disabled={identityBusy}
            activeOpacity={0.7}
          >
            <IdentityCard user={user} />
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={styles.newIdentityButton}
          onPress={handleNewIdentity}
          disabled={identityBusy}
        >
          {identityBusy ? (
            <ActivityIndicator size="small" color={COLORS.inkSubtle} />
          ) : (
            <Text style={styles.newIdentityText}>+ New Identity</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function IdentityCard({
  user,
  isCurrent,
}: {
  user: UserProfile;
  isCurrent?: boolean;
}) {
  return (
    <View
      style={[styles.identityCard, isCurrent && styles.identityCardCurrent]}
    >
      {user.avatarUrl ? (
        <Image source={{ uri: user.avatarUrl }} style={styles.identityAvatar} />
      ) : (
        <View
          style={[styles.identityAvatar, styles.identityAvatarPlaceholder]}
        />
      )}
      <View style={styles.identityInfo}>
        <Text style={styles.identityName} numberOfLines={1}>
          {user.username}
        </Text>
        <Text style={styles.identityPubkey} numberOfLines={1}>
          {user.pubkeyShort}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    flexGrow: 1,
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.inkSubtle,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editLink: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  emptyText: {
    paddingVertical: 12,
    color: COLORS.inkSubtle,
    fontSize: 14,
  },

  // Servers
  serverList: {
    gap: 8,
    marginBottom: 12,
  },
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgHover,
    borderWidth: 1,
    borderColor: COLORS.bgLowContrast,
    borderRadius: 8,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 4,
  },
  serverUrl: {
    flex: 1,
    fontSize: 14,
    color: COLORS.ink,
    fontFamily: 'monospace',
    paddingVertical: 4,
  },
  serverRemoveButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  serverRemoveText: {
    fontSize: 13,
    color: '#ff4444',
    fontWeight: '600',
  },
  addServerRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  addServerInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.ink,
    borderWidth: 1,
    borderColor: COLORS.bgLowContrast,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: COLORS.bgHover,
  },
  addServerButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 56,
  },
  addServerButtonDisabled: {
    opacity: 0.5,
  },
  addServerButtonText: {
    color: COLORS.inkBold,
    fontSize: 14,
    fontWeight: '600',
  },

  // Identity
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgHover,
    borderWidth: 1,
    borderColor: COLORS.bgLowContrast,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  identityCardCurrent: {
    borderColor: COLORS.inkSubtle,
  },
  identityAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  identityAvatarPlaceholder: {
    backgroundColor: COLORS.bgLowContrast,
  },
  identityInfo: {
    flex: 1,
    marginLeft: 12,
  },
  identityName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.inkBold,
  },
  identityPubkey: {
    fontSize: 12,
    color: COLORS.inkSubtle,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  deleteIdentityButton: {
    borderWidth: 1,
    borderColor: '#ff4444',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  deleteIdentityText: {
    color: '#ff4444',
    fontSize: 15,
    fontWeight: '600',
  },
  newIdentityButton: {
    borderWidth: 1,
    borderColor: COLORS.inkSubtle,
    borderRadius: 8,
    borderStyle: 'dashed',
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  newIdentityText: {
    color: COLORS.inkSubtle,
    fontSize: 14,
    fontWeight: '600',
  },
});
