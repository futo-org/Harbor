import { usePolycentricContext } from '@/src/common/lib/polycentric-hooks';
import { useQuery } from '@/src/common/query/hooks/useQuery';
import { Query, v2 } from '@polycentric/react-native';
import { useMemo } from 'react';
import { decodeNotifications, type NotificationData } from '../utils';

export type UseListNotificationsResult = {
  items: NotificationData[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
};

export default function useListNotifications(): UseListNotificationsResult {
  const { client } = usePolycentricContext();
  const identity = client.activeIdentityKey || '';

  const query = useQuery(
    ['list_notifications', identity],
    new Query.ListNotifications({ identity }),
    undefined,
    !!identity,
  );

  const items = useMemo<NotificationData[]>(() => {
    if (!query.data) return [];
    const response = v2.ListNotificationsResponse.fromBinary(
      new Uint8Array(query.data),
    );
    return decodeNotifications(response);
  }, [query.data]);

  return {
    items,
    isLoading: query.isLoading,
    error: query.error,
    refresh: query.refresh,
  };
}
