import { IconButton, Screen, Text } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import Topbar from '@/src/common/components/layout/Topbar';
import { Routes } from '@/src/common/constants/routes';
import { confirm } from '@/src/common/lib/dialogs/alert';
import { usePageTitle } from '@/src/common/lib/navigation/usePageTitle';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { useEventPushIssuesStore } from '@/src/features/core/event-push-issues/useEventPushIssuesStore';
import { useServerFailuresStore } from '@/src/features/core/server-failures/useServerFailuresStore';
import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SyncIssuesList, useSyncIssues } from './SyncIssues';
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

  const clearAll = async () => {
    if (!identityKey) return;
    const ok = await confirm({
      title: 'Clear sync issues',
      message:
        'Remove every reported sync issue? Issues reappear if a later sync reports them again.',
      confirmText: 'Clear',
    });
    if (!ok) return;
    for (const { server } of issues.servers) {
      clearIssues(identityKey, server);
      clearFailure(identityKey, server);
    }
  };

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View style={[Atoms.flex_1, theme.atoms.bg]}>
          <Topbar
            title="Sync events"
            // Custom back button which goes back to settings if there's no router history
            left={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={back}
                hitSlop={Spacing.lg}
                style={({ pressed }) => [pressed && { opacity: 0.5 }]}
              >
                <Icon name="chevronBack" size={24} color="neutral_900" />
              </Pressable>
            }
            right={
              <IconButton
                size="sm"
                variant="ghost"
                accessibilityLabel="Clear all issues"
                icon={(props) => <Icon name="trash" {...props} />}
                disabled={issues.servers.length === 0}
                onPress={() => void clearAll()}
              />
            }
          />
          <ScrollView
            style={Atoms.flex_1}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingBottom: insets.bottom + Spacing['4xl'],
            }}
          >
            {issues.servers.length === 0 || !identityKey ? (
              <Text
                variant="secondary"
                color="neutral_500"
                style={[Atoms.px_lg, Atoms.pt_lg]}
              >
                No servers have reported problems with your events.
              </Text>
            ) : (
              <SyncIssuesList identityKey={identityKey} issues={issues} />
            )}

            <Text variant="secondary" color="neutral_500" style={Atoms.p_md}>
              {lastSynced}
            </Text>
          </ScrollView>
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
