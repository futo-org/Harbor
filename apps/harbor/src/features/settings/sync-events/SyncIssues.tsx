import { IconButton, Text } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { eventRoute } from '@/src/common/lib/navigation/eventRoute';
import { ffiEventKeyToProto } from '@/src/common/lib/polycentric-hooks/helpers';
import { Atoms, type PaletteColorToken, useTheme } from '@/src/common/theme';
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
  {
    icon: 'alertCircle' | 'warning';
    color: PaletteColorToken;
    background: PaletteColorToken;
  }
> = {
  error: {
    icon: 'alertCircle',
    color: 'negative_500',
    background: 'negative_50',
  },
  warning: {
    icon: 'warning',
    color: 'warning_500',
    background: 'warning_50',
  },
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

const eventLabel = (collection: number) =>
  EVENT_LABELS[collection] ?? `Event (collection ${collection})`;

const severityOf = (issue: EventPushIssue): Severity =>
  issue.errors.length > 0 ? 'error' : 'warning';

const DIVIDER = { borderBottomWidth: 1 };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export interface ServerSyncIssues {
  server: string;
  pushIssues: EventPushIssue[];
  failure: ServerFailure | undefined;
}

export interface SyncIssues {
  servers: ServerSyncIssues[];
  count: number;
  severity: Severity | null;
}

/** Push issues and server failures for every server of an identity */
export function useSyncIssues(identityKey: string | null): SyncIssues {
  const identityIssues = useIdentityPushIssues(identityKey);
  const failures = useIdentityServerFailures(identityKey);

  return useMemo(() => {
    const byServer = new Map<string, ServerSyncIssues>();
    const entry = (server: string) => {
      let found = byServer.get(server);
      if (!found) {
        found = { server, pushIssues: [], failure: undefined };
        byServer.set(server, found);
      }
      return found;
    };

    for (const [server, failure] of Object.entries(failures)) {
      entry(server).failure = failure;
    }
    for (const issue of Object.values(identityIssues)) {
      entry(issue.server).pushIssues.push(issue);
    }

    const servers = [...byServer.values()].sort((a, b) =>
      a.server.localeCompare(b.server),
    );
    for (const { pushIssues } of servers) {
      pushIssues.sort((a, b) => b.lastSeen - a.lastSeen);
    }

    const all = servers.flatMap((s) => s.pushIssues);
    const failureCount = servers.filter((s) => s.failure).length;
    const count = all.length + failureCount;
    const severity: Severity | null =
      failureCount > 0 || all.some((i) => i.errors.length > 0)
        ? 'error'
        : all.length > 0
          ? 'warning'
          : null;

    return { servers, count, severity };
  }, [identityIssues, failures]);
}

/** A pill that shows a warning if there are sync issues, or green if there are none */
export function SyncIssuesChip({ issues }: { issues: SyncIssues }) {
  const { theme } = useTheme();
  const { icon, color, background, label } = issues.severity
    ? { ...SEVERITY[issues.severity], label: plural(issues.count, 'issue') }
    : {
        icon: 'checkmarkCircle' as const,
        color: 'positive_500' as const,
        background: 'positive_50' as const,
        label: 'No issues',
      };

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.items_center,
        Atoms.gap_2xs,
        Atoms.px_sm,
        Atoms.py_xs,
        Atoms.rounded_full,
        { backgroundColor: theme.palette[background] },
      ]}
    >
      <Icon name={icon} size={14} color={color} />
      <Text variant="small" fontWeight="semibold" color={color}>
        {label}
      </Text>
    </View>
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
  const { theme } = useTheme();
  const { icon, color } = SEVERITY[severityOf(issue)];
  const messages = [...issue.errors, ...issue.warnings];
  const route = eventRoute(ffiEventKeyToProto(issue.key));

  return (
    <Pressable
      onPress={route ? () => router.navigate(route) : undefined}
      accessibilityRole={route ? 'link' : undefined}
      style={[
        Atoms.flex_row,
        Atoms.items_start,
        Atoms.gap_sm,
        Atoms.pl_lg,
        Atoms.pr_sm,
        Atoms.py_sm,
        theme.atoms.border_neutral_low,
        DIVIDER,
      ]}
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

/** For each server with issues, render a section with a list of its issues */
export function ServerSyncIssuesSection({
  identityKey,
  server,
}: {
  identityKey: string;
  server: ServerSyncIssues;
}) {
  const { theme } = useTheme();
  const dismiss = useEventPushIssuesStore((s) => s.dismiss);
  const clearIssues = useEventPushIssuesStore((s) => s.clearServer);
  const clearFailure = useServerFailuresStore((s) => s.clearServer);

  return (
    <View>
      <View
        style={[
          Atoms.flex_row,
          Atoms.items_center,
          Atoms.gap_sm,
          Atoms.px_lg,
          Atoms.pt_lg,
          Atoms.pb_xs,
          theme.atoms.border_neutral_low,
          DIVIDER,
        ]}
      >
        <Text
          variant="secondary"
          fontWeight="semibold"
          monospace
          numberOfLines={1}
          style={[Atoms.flex_1, Atoms.py_xs]}
        >
          {server.server}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Clear issues for ${server.server}`}
          hitSlop={8}
          onPress={() => {
            clearIssues(identityKey, server.server);
            clearFailure(identityKey, server.server);
          }}
          style={Atoms.py_xs}
        >
          <Text variant="secondary" fontWeight="semibold" color="primary_500">
            Clear
          </Text>
        </Pressable>
      </View>

      {server.failure ? (
        <View
          style={[
            Atoms.flex_row,
            Atoms.items_start,
            Atoms.gap_sm,
            Atoms.px_lg,
            Atoms.py_sm,
            theme.atoms.border_neutral_low,
            DIVIDER,
          ]}
        >
          <View style={Atoms.pt_sm}>
            <Icon name="alertCircle" size={16} color="negative_500" />
          </View>
          <View style={[Atoms.flex_1, Atoms.py_xs]}>
            <Text variant="secondary" fontWeight="semibold">
              Couldn't reach server
            </Text>
            <Text variant="small" color="neutral_500">
              {server.failure.message}
            </Text>
          </View>
        </View>
      ) : null}

      {server.pushIssues.map((issue) => (
        <IssueItem
          key={issue.id}
          issue={issue}
          onDismiss={() => dismiss(identityKey, issue.id)}
        />
      ))}
    </View>
  );
}
