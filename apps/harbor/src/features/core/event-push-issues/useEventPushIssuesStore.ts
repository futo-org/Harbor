import { ffiEventKeyId } from '@/src/common/lib/polycentric-hooks/helpers';
import type { EventKey, ServerPushResult } from '@polycentric/react-native';
import { create } from 'zustand';

/** A server's errors and warnings for one event it was pushed. */
export interface EventPushIssue {
  // `server` and the event key id, joined
  id: string;
  server: string;
  key: EventKey;
  // If not empty, the server did not store the event
  errors: string[];
  // If not empty, the server stored the event but dropped some content
  warnings: string[];
  // Epoch ms when a push result first reported this issue
  firstSeen: number;
  // Epoch ms when a push result last reported this issue
  lastSeen: number;
}

/** A push to a server that failed outright, e.g. it was unreachable. */
export interface ServerFailure {
  message: string;
  at: number;
}

interface EventPushIssuesStore {
  // `EventPushIssue.id` key, ordered by first seen
  issues: Record<string, EventPushIssue>;
  serverFailures: Record<string, ServerFailure>;
  /**
   * Merge one sync's push results into the store and return the issues it
   * added that weren't already in the store.
   */
  record: (results: ServerPushResult[], now?: number) => EventPushIssue[];
  dismiss: (id: string) => void;
  clearServer: (server: string) => void;
  clearAll: () => void;
}

const issueId = (server: string, key: EventKey) =>
  `${server} ${ffiEventKeyId(key)}`;

const mergeMessages = (existing: string[], incoming: string[]) => [
  ...new Set([...existing, ...incoming]),
];

const failureMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Includes both validation warnings/errors returned by servers during the client's push, and
 * failures to connect with servers. The warnings/errors are kept until the user dimisses or clears
 * them. The server failures are replaced each sync, and cleared when a sync succeeds.
 *
 * Note that warnings/errors are kept because the server's heads get updated on a warning (event
 * accepted but not content) or an error followed by an accepted event. This means that, if the
 * client does a partial sync after these two cases, the server will not report the warning/error
 * again, but it will not be fully synced with the client.
 */
export const useEventPushIssuesStore = create<EventPushIssuesStore>(
  (set, get) => ({
    issues: {},
    serverFailures: {},
    record: (results, now = Date.now()) => {
      const issues = { ...get().issues };
      const serverFailures = { ...get().serverFailures };
      const added: EventPushIssue[] = [];

      for (const { server, eventIssues, error } of results) {
        if (error === undefined) {
          delete serverFailures[server];
        } else {
          serverFailures[server] = { message: failureMessage(error), at: now };
        }

        for (const { key, errors, warnings } of eventIssues) {
          const id = issueId(server, key);
          const existing = issues[id];
          if (existing) {
            issues[id] = {
              ...existing,
              errors: mergeMessages(existing.errors, errors),
              warnings: mergeMessages(existing.warnings, warnings),
              lastSeen: now,
            };
          } else {
            const issue: EventPushIssue = {
              id,
              server,
              key,
              errors: mergeMessages([], errors),
              warnings: mergeMessages([], warnings),
              firstSeen: now,
              lastSeen: now,
            };
            issues[id] = issue;
            added.push(issue);
          }
        }
      }

      set({ issues, serverFailures });
      return added;
    },
    dismiss: (id) =>
      set((s) => {
        const { [id]: _, ...issues } = s.issues;
        return { issues };
      }),
    clearServer: (server) =>
      set((s) => {
        const { [server]: _, ...serverFailures } = s.serverFailures;
        const issues = Object.fromEntries(
          Object.entries(s.issues).filter(
            ([, issue]) => issue.server !== server,
          ),
        );
        return { issues, serverFailures };
      }),
    clearAll: () => set({ issues: {}, serverFailures: {} }),
  }),
);
