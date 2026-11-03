import { IconButton, Text } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { eventRoute } from '@/src/common/lib/navigation/eventRoute';
import { ffiEventKeyToProto } from '@/src/common/lib/polycentric-hooks/helpers';
import { Atoms, type PaletteColorToken } from '@/src/common/theme';
import {
  type EventPushIssue,
  useEventPushIssuesStore,
  useIdentityPushIssues,
} from '@/src/features/core/event-push-issues/useEventPushIssuesStore';
import {
  type ServerFailure,
  useIdentityServerFailures,
  useServerFailuresStore,
} from '@/src/features/core/server-failures/useServerFailuresStore';
import { COLLECTION } from '@polycentric/react-native';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

type Severity = 'error' | 'warning';

const SEVERITY: Record<
  Severity,
  { icon: 'ban' | 'flag'; color: PaletteColorToken }
> = {
  error: { icon: 'ban', color: 'negative_500' },
  warning: { icon: 'flag', color: 'warning_500' },
};

// Used to provide more context about warnings/errors
const EVENT_LABELS: Record<number, string> = {
  [COLLECTION.IDENTITY]: 'Identity update',
  [COLLECTION.FEED]: 'Post',
  [COLLECTION.PROFILE]: 'Profile update',
  [COLLECTION.INTERACTIONS]: 'Reaction or repost',
  [COLLECTION.GRAPH]: 'Follow or block',
  [COLLECTION.REPORTS]: 'Report',
  [COLLECTION.LABELS]: 'Label',
  [COLLECTION.VERIFICATIONS]: 'Verification',
};

export const eventLabel = (collection: number) =>
  EVENT_LABELS[collection] ?? `Event (collection ${collection})`;

const severityOf = (issue: EventPushIssue): Severity =>
  issue.errors.length > 0 ? 'error' : 'warning';

export interface ServerIssues {
  issues: EventPushIssue[];
  failure: ServerFailure | undefined;
  count: number;
  severity: Severity | null;
}

export function useServerIssues(
  identityKey: string | null,
  server: string,
): ServerIssues {
  const identityIssues = useIdentityPushIssues(identityKey);
  const failure = useIdentityServerFailures(identityKey)[server];

  return useMemo(() => {
    const issues = Object.values(identityIssues)
      .filter((i) => i.server === server)
      .sort((a, b) => b.lastSeen - a.lastSeen);
    const count = issues.length + (failure ? 1 : 0);
    const severity: Severity | null =
      failure || issues.some((i) => i.errors.length > 0)
        ? 'error'
        : issues.length > 0
          ? 'warning'
          : null;
    return { issues, failure, count, severity };
  }, [identityIssues, failure, server]);
}

/** Shown beside the server name, above the issue list */
export function ServerIssueBadge({
  issues,
  onPress,
}: {
  issues: ServerIssues;
  onPress: () => void;
}) {
  if (!issues.severity) return null;
  const { icon, color } = SEVERITY[issues.severity];

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`${issues.count} sync ${issues.count === 1 ? 'issue' : 'issues'}`}
      style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_xs, Atoms.px_md]}
    >
      <Icon name={icon} size={18} color={color} />
      <Text variant="secondary" fontWeight="semibold" color={color}>
        {issues.count}
      </Text>
    </Pressable>
  );
}

/** A row displayed for each issue in a server's issue list */
function IssueItem({
  issue,
  onDismiss,
}: {
  issue: EventPushIssue;
  onDismiss: () => void;
}) {
  const { icon, color } = SEVERITY[severityOf(issue)];
  const messages = [...issue.errors, ...issue.warnings];
  const route = eventRoute(ffiEventKeyToProto(issue.key));

  return (
    <Pressable
      onPress={route ? () => router.navigate(route) : undefined}
      accessibilityRole={route ? 'link' : undefined}
      style={[Atoms.flex_row, Atoms.items_start, Atoms.gap_sm]}
    >
      <View style={Atoms.pt_sm}>
        <Icon name={icon} size={16} color={color} />
      </View>
      <View style={[Atoms.flex_1, Atoms.py_xs]}>
        <Text variant="secondary" fontWeight="semibold">
          {issue.errors.length > 0
            ? `${eventLabel(issue.key.collection)} not saved`
            : `${eventLabel(issue.key.collection)} saved without content`}
        </Text>
        {messages.map((message) => (
          <Text key={message} variant="small" color="neutral_500">
            {message}
          </Text>
        ))}
      </View>
      <IconButton
        variant="ghost"
        compact
        accessibilityLabel="Dismiss"
        icon={() => <Icon name="close" size={18} color="neutral_500" />}
        onPress={onDismiss}
      />
    </Pressable>
  );
}

/** A list of the server's failure and event issues, shown under its name when expanded. */
export function ServerIssueList({
  identityKey,
  server,
  issues,
}: {
  identityKey: string;
  server: string;
  issues: ServerIssues;
}) {
  const dismiss = useEventPushIssuesStore((s) => s.dismiss);
  const clearIssues = useEventPushIssuesStore((s) => s.clearServer);
  const clearFailure = useServerFailuresStore((s) => s.clearServer);

  if (!issues.severity) return null;

  return (
    <View style={[Atoms.gap_xs, Atoms.pl_lg, Atoms.pr_sm, Atoms.pb_sm]}>
      {issues.failure ? (
        <View style={[Atoms.flex_row, Atoms.items_start, Atoms.gap_sm]}>
          <View style={Atoms.pt_sm}>
            <Icon name="closeCircle" size={16} color="negative_500" />
          </View>
          <View style={[Atoms.flex_1, Atoms.py_xs]}>
            <Text variant="secondary" fontWeight="semibold">
              Couldn't reach server
            </Text>
            <Text variant="small" color="neutral_500">
              {issues.failure.message}
            </Text>
          </View>
        </View>
      ) : null}

      {issues.issues.map((issue) => (
        <IssueItem
          key={issue.id}
          issue={issue}
          onDismiss={() => dismiss(identityKey, issue.id)}
        />
      ))}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          clearIssues(identityKey, server);
          clearFailure(identityKey, server);
        }}
        style={[Atoms.self_end, Atoms.py_xs, Atoms.pr_md]}
      >
        <Text variant="secondary" fontWeight="semibold" color="primary_500">
          Clear all
        </Text>
      </Pressable>
    </View>
  );
}
