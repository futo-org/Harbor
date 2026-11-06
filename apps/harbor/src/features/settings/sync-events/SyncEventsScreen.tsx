import { Screen, ScreenHeader, Text } from '@/src/common/components';
import { Routes } from '@/src/common/constants/routes';
import { usePageTitle } from '@/src/common/lib/navigation/usePageTitle';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { useEventPushIssuesStore } from '@/src/features/core/event-push-issues/useEventPushIssuesStore';
import { useServerFailuresStore } from '@/src/features/core/server-failures/useServerFailuresStore';
import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ServerSyncIssuesSection, useSyncIssues } from './SyncIssues';
import { useLastSyncedLabel } from './useLastSyncedLabel';

/**
 * Lists validation errors/warnings servers reported for the current identity events, plus whether
 * a server could be reached, for each server.
 */
export default function SyncEventsScreen() {
  usePageTitle('Sync events');
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { identityKey } = useCurrentIdentity();
  const issues = useSyncIssues(identityKey);
  const lastSynced = useLastSyncedLabel(identityKey);
  const clearIssues = useEventPushIssuesStore((s) => s.clearServer);
  const clearFailure = useServerFailuresStore((s) => s.clearServer);

  const back = () =>
    router.canGoBack()
      ? router.back()
      : router.navigate(Routes.tabs.settings.index);

  const clearAll = () => {
    if (!identityKey) return;
    for (const { server } of issues.servers) {
      clearIssues(identityKey, server);
      clearFailure(identityKey, server);
    }
  };

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View style={[Atoms.flex_1, theme.atoms.bg]}>
          <View style={Atoms.px_lg}>
            <ScreenHeader title="Sync events" onBack={back} />
          </View>
          <ScrollView
            style={Atoms.flex_1}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingBottom: insets.bottom + Spacing['4xl'],
            }}
          >
            <View
              style={[
                Atoms.flex_row,
                Atoms.items_center,
                Atoms.justify_between,
                Atoms.px_lg,
              ]}
            >
              <Text variant="secondary" color="neutral_500">
                {lastSynced}
              </Text>
              {issues.servers.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={clearAll}
                >
                  <Text
                    variant="secondary"
                    fontWeight="semibold"
                    color="primary_500"
                  >
                    Clear all
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {issues.servers.length === 0 || !identityKey ? (
              <Text
                variant="secondary"
                color="neutral_500"
                style={[Atoms.px_lg, Atoms.pt_lg]}
              >
                No servers have reported problems with your events.
              </Text>
            ) : (
              <View>
                {issues.servers.map((server) => (
                  <ServerSyncIssuesSection
                    key={server.server}
                    identityKey={identityKey}
                    server={server}
                  />
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
