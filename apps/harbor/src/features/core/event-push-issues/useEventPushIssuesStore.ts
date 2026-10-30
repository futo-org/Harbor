import { ffiEventKeyId } from '@/src/common/lib/polycentric-hooks/helpers';
import type { EventKey, ServerPushResult } from '@polycentric/react-native';
import { create } from 'zustand';

/** A server's errors/warnings for a pushed event. */
export interface EventPushIssue {
  // ID derived from server URL and event key, used to deduplication and look-up
  id: string;
  // URL of the server that reported the issue
  server: string;
  key: EventKey;
  // If not empty, the server did not store the event
  errors: string[];
  // If not empty, the server may have stored the event (if `errors` is empty), but dropped the
  // content
  warnings: string[];
  // Epoch ms when a push result first reported this issue
  firstSeen: number;
  // Epoch ms when a push result last reported this issue
  lastSeen: number;
}

/**
 * Stores errors/warnings for each server of each identity. See also {@link useIdentityPushIssues}.
 */
interface EventPushIssuesStore {
  // Identity, then server URL + event key, are used to map to event push issues
  issues: Record<string, Record<string, EventPushIssue>>;
  /**
   * Record push results received from a sync and return any newly added issues. Any report that was
   * already stored for an event gets replaced.
   */
  record: (results: ServerPushResult[], now?: number) => EventPushIssue[];
  dismiss: (identity: string, id: string) => void;
  /** Clear all event push issues stored for an identity */
  clearServer: (identity: string, server: string) => void;
  clearAll: () => void;
}

const issueId = (server: string, key: EventKey) =>
  `${server} ${ffiEventKeyId(key)}`;

const uniqueMessages = (messages: string[]) => [...new Set(messages)];

/**
 * Validation warnings/errors returned by servers during the client's push. They're kept until the
 * user dismisses or clears them.
 *
 * Note that warnings/errors are kept because the server's heads get updated on a warning (event
 * accepted but not content) or an error followed by an accepted event. This means that, if the
 * client does a partial sync after these two cases, the server will not report the warning/error
 * again, even though the problematic events did not successfully sync.
 */
export const useEventPushIssuesStore = create<EventPushIssuesStore>(
  (set, get) => ({
    issues: {},
    record: (results, now = Date.now()) => {
      // Copy only touched identities so others' selectors stay stable
      const issues = { ...get().issues };
      const touched = new Set<string>();
      const added: EventPushIssue[] = [];

      for (const { identity, server, eventIssues } of results) {
        if (eventIssues.length === 0) continue;
        if (!touched.has(identity)) {
          touched.add(identity);
          issues[identity] = { ...issues[identity] };
        }
        const identityIssues = issues[identity];

        for (const { key, errors, warnings } of eventIssues) {
          const id = issueId(server, key);
          const existing = identityIssues[id];
          if (existing) {
            // Replace, so an error followed by a warning shows only the warning
            identityIssues[id] = {
              ...existing,
              errors: uniqueMessages(errors),
              warnings: uniqueMessages(warnings),
              lastSeen: now,
            };
          } else {
            const issue: EventPushIssue = {
              id,
              server,
              key,
              errors: uniqueMessages(errors),
              warnings: uniqueMessages(warnings),
              firstSeen: now,
              lastSeen: now,
            };
            identityIssues[id] = issue;
            added.push(issue);
          }
        }
      }

      if (touched.size > 0) set({ issues });
      return added;
    },
    dismiss: (identity, id) =>
      set((s) => {
        const { [id]: _, ...identityIssues } = s.issues[identity] ?? {};
        return { issues: { ...s.issues, [identity]: identityIssues } };
      }),
    clearServer: (identity, server) =>
      set((s) => {
        const identityIssues = Object.fromEntries(
          Object.entries(s.issues[identity] ?? {}).filter(
            ([, issue]) => issue.server !== server,
          ),
        );
        return { issues: { ...s.issues, [identity]: identityIssues } };
      }),
    clearAll: () => set({ issues: {} }),
  }),
);

const NO_ISSUES: Record<string, EventPushIssue> = {};

/** Get the store of event push issues for a specific identity. */
export const useIdentityPushIssues = (identity: string | null) =>
  useEventPushIssuesStore((s) =>
    identity === null ? NO_ISSUES : (s.issues[identity] ?? NO_ISSUES),
  );
