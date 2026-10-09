import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { setQueryCache, useQuery } from '@/src/common/query/hooks/useQuery';
import { Query, v2 } from '@polycentric/react-native';
import { useCallback, useMemo } from 'react';

/** Servers stop counting here. */
const MAX_COUNT = 100;

function queryKey(identity: string) {
  return ['unread_notification_count', identity];
}

function encodeCount(count: number): ArrayBuffer {
  return v2.SubscribeUnreadNotificationCountResponse.toBinary({ count })
    .buffer as ArrayBuffer;
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
    if (!query.data) return 0;
    return v2.SubscribeUnreadNotificationCountResponse.fromBinary(
      new Uint8Array(query.data),
    ).count;
  }, [query.data]);
}

/**
 * Marks every notification of the active identity as read on every server
 * (`NotificationService.AcknowledgeNotifications`), zeroing the badge first.
 */
export function useAcknowledgeNotifications(): () => Promise<void> {
  const client = usePolycentric();
  const identity = client.activeIdentityKey ?? '';

  return useCallback(async () => {
    if (!identity) return;
    const key = queryKey(identity);
    setQueryCache(key, { data: encodeCount(0) });
    await client.acknowledgeNotifications();
    client.core.invalidateQuery(key);
  }, [client, identity]);
}
