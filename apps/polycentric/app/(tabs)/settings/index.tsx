import {
  Avatar,
  Box,
  Button,
  IconButton,
  IdentityBadge,
  LinkButton,
  ListItem,
  ListItemGroup,
  PageHeader,
  Screen,
  Text,
  TextInput,
} from '@/components';
import { REPORT_BUG_URL, SOURCE_CODE_URL, TAB_BAR_HEIGHT } from '@/constants';
import { useLegacyTheme } from '@/legacyTheme';
import { confirm } from '@/lib/dialogs/alert';
import {
  identiconUrl,
  publicKeyToString,
  toBase64,
  useCurrentIdentity,
  usePolycentric,
  usePolycentricContext,
  useUsername,
} from '@/lib/polycentric-hooks';
import { useSheet } from '@/lib/sheet';
import { Atoms, useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { types } from '@polycentric/react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, View } from 'react-native';

function AppearanceSettingRow() {
  const { theme, setActiveThemeName } = useTheme();
  const { setLegacyThemeMode } = useLegacyTheme();

  const onPress = () => {
    const next = theme.name === 'dark' ? 'light' : 'dark';
    setActiveThemeName(next);
    setLegacyThemeMode(next);
  };

  return (
    <ListItem onPress={onPress}>
      <View
        style={[Atoms.flex_row, Atoms.align_center, Atoms.gap_md, Atoms.pl_xs]}
      >
        <Ionicons
          name={theme.name === 'dark' ? 'moon' : 'sunny'}
          size={22}
          style={theme.atoms.icon_accent}
        />
        <Text variant="body" style={theme.atoms.text}>
          Theme
        </Text>
      </View>
    </ListItem>
  );
}

export default function Settings() {
  const { legacyTheme } = useLegacyTheme();
  const { Sheet: IdentitySheet, present: presentIdentity } = useSheet();
  const { Sheet: ServersSheet, present: presentServers } = useSheet();
  const currentIdentity = useCurrentIdentity();
  const publicKey = currentIdentity?.identity?.keyPair.publicKey;

  return (
    <Screen background={{ gradient: 'top' }}>
      <Box paddingHorizontal="lg" flex={1}>
        <PageHeader title="Settings" />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            gap: legacyTheme.spacing.xl,
            paddingBottom: TAB_BAR_HEIGHT + 16,
          }}
        >
          <ListItemWrapper onPress={() => presentIdentity()}>
            <>
              {publicKey && <IdentityBadge publicKey={publicKey} size="lg" />}
              <IdentitySheet detents={[1]} dismissible scrollable>
                {publicKey && <IdentitySettingsContent publicKey={publicKey} />}
              </IdentitySheet>
            </>
          </ListItemWrapper>

          <ListItemGroup label="Appearance">
            <AppearanceSettingRow />
          </ListItemGroup>

          <ListItemGroup label="Servers">
            <ListItemWrapper onPress={() => presentServers()}>
              <Text variant="body">Polycentric servers</Text>
            </ListItemWrapper>
          </ListItemGroup>

          <ServersSheet detents={[0.5, 1]} dismissible scrollable>
            <ServersSheetContent />
          </ServersSheet>

          <ListItemGroup>
            <ListItemWrapper onPress={() => Linking.openURL(REPORT_BUG_URL)}>
              <Text variant="body">Report a bug</Text>
            </ListItemWrapper>
          </ListItemGroup>

          <SourceCodeItem />
        </ScrollView>
      </Box>
    </Screen>
  );
}

function IdentitySettingsContent({
  publicKey,
}: {
  publicKey: types.PublicKey;
}) {
  const { legacyTheme } = useLegacyTheme();
  const client = usePolycentric();
  const { identity } = useCurrentIdentity();
  const username = useUsername(publicKey);

  const [nameExpanded, setNameExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [eventCount, setEventCount] = useState(0);

  useEffect(() => {
    setNameDraft(username);
  }, [username]);

  useEffect(() => {
    let cancelled = false;

    client.storage.processStates
      .getCurrentLogicalClock(
        client.currentIdentity.keyPair.keyType,
        client.currentIdentity.keyPair.publicKey.key,
        client.process.process,
      )
      .then((logicalClock) => {
        if (!cancelled) {
          setEventCount(Number(logicalClock));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEventCount(0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, identity]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await client.contentManager.createUsername(nameDraft);
      await client.sync();
      setEditing(false);
    } catch (err) {
      console.error('Failed to save username:', err);
    } finally {
      setSaving(false);
    }
  }, [client, nameDraft]);

  const handleCancel = useCallback(() => {
    setNameDraft(username);
    setEditing(false);
  }, [username]);

  const fullPubkey = publicKeyToString(publicKey);
  const processId = identity?.process?.process
    ? toBase64(
        identity.process.process instanceof Uint8Array
          ? identity.process.process
          : new Uint8Array(identity.process.process),
      )
    : '';
  const displayName = username;
  const avatarUrl = identiconUrl(publicKey, 160);

  return (
    <Box padding="lg" gap="xl">
      {/* Hero: avatar + name */}
      <Box alignItems="center" gap="md" style={{ paddingTop: 8 }}>
        <Avatar
          source={avatarUrl ? { uri: avatarUrl } : undefined}
          size="massive"
        />

        {editing ? (
          <Box gap="sm" style={{ width: '100%' }}>
            <TextInput
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="Display name"
              autoFocus
            />
            <Box flexDirection="row" gap="sm" justifyContent="center">
              <Button
                title={saving ? 'Saving...' : 'Save'}
                onPress={handleSave}
                variant="primary"
                size="sm"
              />
              <Button
                title="Cancel"
                onPress={handleCancel}
                variant="tertiary"
                size="sm"
              />
            </Box>
          </Box>
        ) : (
          <Box alignItems="center" gap="xs">
            <Text
              variant="title"
              fontWeight="bold"
              numberOfLines={nameExpanded ? undefined : 2}
              ellipsizeMode="tail"
              style={{ textAlign: 'center' }}
              onPress={() => setNameExpanded((v) => !v)}
            >
              {displayName || 'Anonymous'}
            </Text>
            <LinkButton title="Edit name" onPress={() => setEditing(true)} />
          </Box>
        )}

        <Text variant="subtitle" color="neutralSurface">
          {eventCount} {eventCount === 1 ? 'event' : 'events'}
        </Text>
      </Box>

      {/* Details */}
      <Box
        gap="md"
        padding="md"
        backgroundColor="neutralSurfaceOpacity20"
        borderRadius="md"
      >
        <Box gap="xs">
          <Text variant="small" color="neutralSurface">
            PUBLIC KEY
          </Text>
          <Text
            variant="secondary"
            style={{ fontFamily: 'monospace' }}
            selectable
          >
            {fullPubkey}
          </Text>
        </Box>

        <Box
          style={{
            height: 1,
            backgroundColor: legacyTheme.colors.neutralSurfaceOpacity20,
          }}
        />

        <Box gap="xs">
          <Text variant="small" color="neutralSurface">
            PROCESS ID
          </Text>
          <Text
            variant="secondary"
            style={{ fontFamily: 'monospace' }}
            selectable
          >
            {processId}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

function ServersSheetContent() {
  const client = usePolycentric();
  const { store } = usePolycentricContext();
  const { identity } = useCurrentIdentity();
  const { legacyTheme } = useLegacyTheme();

  const [servers, setServers] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [newServerUrl, setNewServerUrl] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const refreshServers = useCallback(() => {
    setServers(client.queryManager.queryServers(client.currentSystem));
  }, [client]);

  useEffect(() => {
    refreshServers();
  }, [identity, refreshServers]);

  const handleAddServer = async () => {
    const url = newServerUrl.trim();
    if (!url || isBusy) return;
    setIsBusy(true);
    try {
      await client.addServer(url);
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
      await client.contentManager.createRemoveServer(server);
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
    <Box padding="lg" gap="lg">
      <Box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
      >
        <Text variant="subtitle" fontWeight="semibold">
          Servers
        </Text>
        <LinkButton
          title={isEditing ? 'Done' : 'Edit'}
          onPress={() => {
            setIsEditing(!isEditing);
            setNewServerUrl('');
          }}
        />
      </Box>

      {servers.length === 0 ? (
        <Text variant="secondary" color="neutralSurface">
          No servers configured
        </Text>
      ) : (
        <Box gap="sm">
          {servers.map((server) => (
            <Box
              key={server}
              flexDirection="row"
              justifyContent="space-between"
              alignItems="center"
              padding="md"
              backgroundColor="neutralSurfaceOpacity20"
              borderRadius="md"
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
                      color={legacyTheme.colors.destructive}
                    />
                  )}
                  onPress={() => handleRemoveServer(server)}
                />
              )}
            </Box>
          ))}
        </Box>
      )}

      {isEditing && (
        <Box flexDirection="row" gap="sm" alignItems="center">
          <Box flex={1}>
            <TextInput
              placeholder="https://server.example.com"
              value={newServerUrl}
              onChangeText={setNewServerUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </Box>
          {isBusy ? (
            <ActivityIndicator />
          ) : (
            <IconButton
              variant="ghost"
              icon={() => (
                <Ionicons
                  name="add-circle-outline"
                  size={28}
                  color={
                    newServerUrl.trim()
                      ? legacyTheme.colors.primary
                      : legacyTheme.colors.neutralSurface
                  }
                />
              )}
              onPress={handleAddServer}
            />
          )}
        </Box>
      )}
    </Box>
  );
}

function ListItemWrapper({
  children,
  onPress,
}: {
  children: React.ReactNode;
  onPress: () => void;
}) {
  const { legacyTheme } = useLegacyTheme();

  return (
    <ListItem onPress={onPress}>
      <Box
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        paddingLeft="xs"
      >
        {children}
        <Ionicons
          name="chevron-forward"
          size={18}
          color={legacyTheme.colors.neutralSurface}
        />
      </Box>
    </ListItem>
  );
}

function SourceCodeItem() {
  return (
    <Box
      paddingTop="3xl"
      paddingHorizontal="md"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <LinkButton
        title="Source code"
        onPress={() => Linking.openURL(SOURCE_CODE_URL)}
      />
    </Box>
  );
}
