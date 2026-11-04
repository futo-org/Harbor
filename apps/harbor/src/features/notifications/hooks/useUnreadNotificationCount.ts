import {
  queryPayload,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { setQueryCache, useQuery } from '@/src/common/query/hooks/useQuery';
import {
  Query,
  QueryData,
  QueryData_Tags,
  v2,
} from '@polycentric/react-native';
import { useCallback, useMemo } from 'react';

/** Servers stop counting here. */
const MAX_COUNT = 100;

function queryKey(identity: string) {
  return ['unread_notification_count', identity];
}

function countData(count: number): QueryData {
  return new QueryData.UnreadNotificationCount({
    response: v2.SubscribeUnreadNotificationCountResponse.create({ count }),
  });
}

/** Badge text for `count` unread notifications, or null when none. */
export function unreadNotificationsBadgeLabel(count: number): string | null {
  if (count <= 0) return null;
  return count >= MAX_COUNT ? '99+' : String(count);
}

/**
 * Unread notification count for the active identity, pushed by the servers
 * over an open `NotificationService.SubscribeUnreadNotificationCount`
 * stream while `enabled`.
 */
export default function useUnreadNotificationCount(enabled = true): number {
  const client = usePolycentric();
  const identity = client.activeIdentityKey ?? '';

  const query = useQuery(
    queryKey(identity),
    new Query.SubscribeUnreadNotificationCount({}),
    undefined,
    enabled && !!identity,
  );

  return useMemo(() => {
    return (
      queryPayload(query.data, QueryData_Tags.UnreadNotificationCount)?.response
        .count ?? 0
    );
  }, [query.data]);
}

/**
 * Marks the active identity's notifications up to `lastSeen` as read on
 * every server (`NotificationService.AcknowledgeNotifications`), zeroing
 * the badge first.
 */
export function useAcknowledgeNotifications(): (
  lastSeen: v2.EventKey,
) => Promise<void> {
  const client = usePolycentric();
  const identity = client.activeIdentityKey ?? '';

  return useCallback(
    async (lastSeen: v2.EventKey) => {
      if (!identity) return;
      const key = queryKey(identity);
      setQueryCache(key, { data: countData(0) });
      await client.acknowledgeNotifications(lastSeen);
      await client.invalidateQuery(key);
    },
    [client, identity],
  );
}
