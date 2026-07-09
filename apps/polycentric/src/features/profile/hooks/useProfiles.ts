import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { useQueryStore } from '@/src/common/query/hooks/useQuery';
import { FetchMode, Query } from '@polycentric/react-native';
import { useEffect, useMemo } from 'react';
import { decodeProfile, type DecodedProfile } from '../lib/decodeProfile';
import { profileQueryKey } from './useProfile';

export function useProfiles(
  identities: readonly string[],
): Map<string, DecodedProfile | null> {
  const client = usePolycentric();

  // Key the effect on contents, not array identity, so a re-render with an
  // equal list doesn't churn subscriptions.
  const joined = identities.join('\n');

  useEffect(() => {
    if (!joined) return;
    const ids = joined.split('\n');
    const store = useQueryStore.getState();
    for (const identity of ids) {
      store.subscribe(profileQueryKey(identity).join('\0'), {
        client,
        queryKey: profileQueryKey(identity),
        query: new Query.GetProfile({ identity }),
        opts: { fetchMode: FetchMode.OfflineOnly },
      });
    }
    return () => {
      const store = useQueryStore.getState();
      for (const identity of ids) {
        store.unsubscribe(profileQueryKey(identity).join('\0'));
      }
    };
  }, [joined, client]);

  const queries = useQueryStore((s) => s.queries);

  return useMemo(() => {
    const map = new Map<string, DecodedProfile | null>();
    if (!joined) return map;
    for (const identity of joined.split('\n')) {
      const data = queries.get(profileQueryKey(identity).join('\0'))?.data;
      let decoded: DecodedProfile | null = null;
      if (data && data.byteLength > 0) {
        try {
          decoded = decodeProfile(data);
        } catch {
          decoded = null;
        }
      }
      map.set(identity, decoded);
    }
    return map;
  }, [queries, joined]);
}
