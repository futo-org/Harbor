import { IconButton, Text } from '@/src/common/components';
import { ProfileAvatar } from '@/src/common/components/Avatar/ProfileAvatar';
import Icon from '@/src/common/components/Icon';
import { eventRoute } from '@/src/common/lib/navigation/eventRoute';
import {
  ffiEventKeyToProto,
  getKeyFingerprint,
} from '@/src/common/lib/polycentric-hooks/helpers';
import { mentionsToPlainText } from '@/src/common/util/parseTextLinks';
import {
  Atoms,
  type PaletteColorToken,
  typography,
  useTheme,
} from '@/src/common/theme';
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
import { EventSummary } from '@/src/features/notifications/EventSummary';
import { usePostById } from '@/src/features/post/hooks/usePostById';
import { Username } from '@/src/features/profile/Username';
import { COLLECTION, FetchMode } from '@polycentric/react-native';
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

/** What the event did, phrased like a notification's action line. */
const EVENT_SUMMARIES: Record<number, string> = {
  [COLLECTION.IDENTITY]: 'updated their identity',
  [COLLECTION.FEED]: 'posted',
  [COLLECTION.PROFILE]: 'updated their profile',
  [COLLECTION.INTERACTIONS]: 'reacted to or reposted a post',
  [COLLECTION.GRAPH]: 'followed or blocked someone',
  [COLLECTION.REPORTS]: 'filed a report',
  [COLLECTION.LABELS]: 'applied a label',
  [COLLECTION.VERIFICATIONS]: 'made a verification',
};

// A compact IconButton has a 40px hit area; let it overhang the 20px text line and right padding
// of the `EventSummary` rather collide with those bounding boxes
const DISMISS_OVERHANG = -(40 - typography.lineHeight.md) / 2;
const DISMISS_OVERHANG_RIGHT = -(40 - 16) / 2;

/** Get a server URL without `https://` or any other scheme. */
const serverLabel = (server: string) => server.replace(/^[a-z]+:\/\//i, '');

/**
 * The error/warning shown at the top of an item: a severity icon, the label and the server that
 * reported it, then the messages under it.
 */
function ErrorMessage({
  severity,
  label,
  server,
  messages,
  onDismiss,
}: {
  severity: Severity;
  label: string;
  server: string;
  messages: string[];
  onDismiss: () => void;
}) {
  const { icon, color } = SEVERITY[severity];
  return (
    <View>
      <View style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_sm]}>
        <Icon name={icon} size={16} color={color} />
        <Text
          variant="body"
          color={color}
          numberOfLines={1}
          style={Atoms.flex_1}
        >
          {`${label} (${serverLabel(server)})`}
        </Text>
        <IconButton
          variant="ghost"
          compact
          style={{
            marginVertical: DISMISS_OVERHANG,
            marginRight: DISMISS_OVERHANG_RIGHT,
          }}
          accessibilityLabel="Dismiss"
          icon={() => <Icon name="close" size={16} color="neutral_500" />}
          onPress={onDismiss}
        />
      </View>
      <Text
        color="neutral_500"
        monospace
        fontSize="xs"
        lineHeight="logs"
        numberOfLines={2}
        // Indented past the 16px icon and 8px gap, to line up with the label
        style={Atoms.pl_2xl}
      >
        {messages.join('; ')}
      </Text>
    </View>
  );
}

/**
 * A row displayed for each validation warning/error.
 */
function IssueItem({
  issue,
  onDismiss,
}: {
  issue: EventPushIssue;
  onDismiss: () => void;
}) {
  const { theme } = useTheme();
  const protoKey = ffiEventKeyToProto(issue.key);
  const route = eventRoute(protoKey);
  const isPost = issue.key.collection === COLLECTION.FEED;

  // The event was authored locally, so read it from the local store only
  const { post } = usePostById(
    isPost ? protoKey.identity : undefined,
    getKeyFingerprint(protoKey.signedBy),
    protoKey.sequence,
    { fetchMode: FetchMode.OfflineOnly },
  );

  const summary = isPost
    ? post?.reply
      ? 'replied'
      : post?.quoteId
        ? 'quoted a post'
        : 'posted'
    : (EVENT_SUMMARIES[issue.key.collection] ?? 'published an event');

  return (
    <Pressable
      onPress={route ? () => router.navigate(route) : undefined}
      accessibilityRole={route ? 'link' : undefined}
      style={[Atoms.p_md, theme.atoms.border_neutral_low, DIVIDER]}
    >
      <ErrorMessage
        severity={severityOf(issue)}
        label={
          issue.errors.length > 0
            ? `${eventLabel(issue.key.collection)} not saved`
            : `${eventLabel(issue.key.collection)} saved without content`
        }
        server={issue.server}
        messages={[...issue.errors, ...issue.warnings]}
        onDismiss={onDismiss}
      />

      <EventSummary
        style={[Atoms.pl_2xl, Atoms.mt_md]}
        leading={<ProfileAvatar identityKey={issue.key.identity} size="md" />}
        title={<Username identity={issue.key.identity} fontWeight="bold" />}
        action={summary}
        createdAt={post?.createdAt}
        preview={post?.content ? mentionsToPlainText(post.content) : undefined}
      />
    </Pressable>
  );
}

/** A row for a server that couldn't be reached. */
function FailureItem({
  server,
  failure,
  onDismiss,
}: {
  server: string;
  failure: ServerFailure;
  onDismiss: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={[Atoms.p_md, theme.atoms.border_neutral_low, DIVIDER]}>
      <ErrorMessage
        severity="error"
        label="Sync failed"
        server={server}
        messages={[failure.message]}
        onDismiss={onDismiss}
      />
    </View>
  );
}

/**
 * Every sync issue of an identity in one list: server failures first, then event issues, most
 * recently reported first.
 */
export function SyncIssuesList({
  identityKey,
  issues,
}: {
  identityKey: string;
  issues: SyncIssues;
}) {
  const dismiss = useEventPushIssuesStore((s) => s.dismiss);
  const clearFailure = useServerFailuresStore((s) => s.clearServer);

  const failures = issues.servers.flatMap(({ server, failure }) =>
    failure ? [{ server, failure }] : [],
  );
  const pushIssues = issues.servers
    .flatMap((s) => s.pushIssues)
    .sort((a, b) => b.lastSeen - a.lastSeen);

  return (
    <View>
      {failures.map(({ server, failure }) => (
        <FailureItem
          key={server}
          server={server}
          failure={failure}
          onDismiss={() => clearFailure(identityKey, server)}
        />
      ))}
      {pushIssues.map((issue) => (
        <IssueItem
          key={issue.id}
          issue={issue}
          onDismiss={() => dismiss(identityKey, issue.id)}
        />
      ))}
    </View>
  );
}
