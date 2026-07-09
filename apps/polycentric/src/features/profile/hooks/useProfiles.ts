import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { useQueryStore } from '@/src/common/query/hooks/useQuery';
import { FetchMode, Query } from '@polycentric/react-native';
import { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { decodeProfile, type DecodedProfile } from '../lib/decodeProfile';
import { profileQueryKey } from './useProfile';

export function useProfiles(
  identities: readonly string[],
): Map<string, DecodedProfile | null> {
  const client = usePolycentric();

  // Key on contents, not array identity, so a re-render with an equal list
  // doesn't churn subscriptions.
  const joined = identities.join('\n');
  const ids = useMemo(() => (joined ? joined.split('\n') : []), [joined]);

  useEffect(() => {
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
  }, [ids, client]);

  // Select only the subscribed entries' data — the store rebuilds its map on
  // every query update anywhere, so selecting the whole map would re-render
  // (and re-decode every profile) on unrelated ticks.
  const data = useQueryStore(
    useShallow((s) =>
      ids.map(
        (identity) => s.queries.get(profileQueryKey(identity).join('\0'))?.data,
      ),
    ),
  );

  return useMemo(() => {
    const map = new Map<string, DecodedProfile | null>();
    ids.forEach((identity, i) => {
      const bytes = data[i];
      let decoded: DecodedProfile | null = null;
      if (bytes && bytes.byteLength > 0) {
        try {
          decoded = decodeProfile(bytes);
        } catch {
          decoded = null;
        }
      }
      map.set(identity, decoded);
    });
    return map;
  }, [ids, data]);
}
