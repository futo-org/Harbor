import { useQuery } from '@/src/common/query/hooks/useQuery';
import { Query } from '@polycentric/react-native';

export default function useListNotifications() {
  const query = useQuery(
    ['list_notifications'],
    new Query.ListNotifications({ identity: '' }),
  );

  return query;
}
