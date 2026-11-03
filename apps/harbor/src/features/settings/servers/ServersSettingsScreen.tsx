import { Screen, ScreenHeader, Text } from '@/src/common/components';
import { Routes } from '@/src/common/constants/routes';
import { usePageTitle } from '@/src/common/lib/navigation/usePageTitle';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddServerForm } from './AddServerForm';
import {
  ServerIssueBadge,
  ServerIssueList,
  useServerIssues,
} from './ServerIssues';
import { ServerRow } from './ServerRow';
import { useServerSettings } from './useServerSettings';
import { useCurrentAuthorization } from '@/src/common/lib/polycentric-hooks/useCurrentAuthorization';

/**
 * A server URL plus a badge for any push issues. When clicked, it expands to list the push issues.
 */
function ActiveServerRow({
  identityKey,
  server,
  onRemove,
}: {
  identityKey: string | null;
  server: string;
  onRemove?: () => void;
}) {
  const issues = useServerIssues(identityKey, server);
  const [expanded, setExpanded] = useState(false);
  const toggle = issues.severity ? () => setExpanded((e) => !e) : undefined;

  return (
    <ServerRow
      server={server}
      status="active"
      onAction={onRemove}
      onPress={toggle}
      trailing={
        toggle ? <ServerIssueBadge issues={issues} onPress={toggle} /> : null
      }
    >
      {expanded && identityKey ? (
        <ServerIssueList
          identityKey={identityKey}
          server={server}
          issues={issues}
        />
      ) : null}
    </ServerRow>
  );
}

export default function ServersSettingsScreen() {
  usePageTitle('Servers');
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    identityKey,
    servers,
    suggestedServers,
    isBusy,
    addError,
    addServer,
    removeServer,
  } = useServerSettings();
  const { canRotate } = useCurrentAuthorization();

  const back = () =>
    router.canGoBack()
      ? router.back()
      : router.navigate(Routes.tabs.settings.index);

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View
          style={[
            Atoms.px_lg,
            Atoms.flex_1,
            { backgroundColor: theme.atoms.bg.backgroundColor },
          ]}
        >
          <ScreenHeader title="Servers" onBack={back} />
          <ScrollView
            style={Atoms.flex_1}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              Atoms.gap_lg,
              { paddingBottom: insets.bottom + Spacing['4xl'] },
            ]}
          >
            {servers.length === 0 ? (
              <Text variant="secondary" color="neutral_500">
                No servers configured
              </Text>
            ) : (
              <View style={Atoms.gap_sm}>
                {servers.map((server) => (
                  <ActiveServerRow
                    key={server}
                    identityKey={identityKey}
                    server={server}
                    onRemove={
                      canRotate ? () => removeServer(server) : undefined
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
          </ScrollView>
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
