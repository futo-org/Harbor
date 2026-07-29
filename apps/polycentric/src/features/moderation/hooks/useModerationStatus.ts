import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { useQuery } from '@/src/common/query/hooks/useQuery';
import { decodeStatusByServer, Query } from '@polycentric/react-native';
import { useMemo } from 'react';

export type ModerationStatus = {
  // True while the IsModerator fan-out is in flight (including the first
  // one).
  isLoading: boolean;
  // Configured servers the active identity is a moderator on.
  moderatedServers: string[];
  // Whether the active identity moderates at least one configured server.
  isModerator: boolean;
};

/**
 * Which configured servers the active identity moderates — one
 * `IdentityService.IsModerator` fan-out returning a
 * `serverUrl -> isModerator` map, where a server that fails to answer is
 * absent (i.e. counts as "not a moderator"). Subscribed through
 * `useQuery`, so every consumer shares the same query state, and the
 * active identity is part of the query key, so an identity switch
 * re-queries on its own.
 */
export default function useModerationStatus(): ModerationStatus {
  const client = usePolycentric();
  const identity = client.activeIdentityKey ?? '';

  const query = useQuery(
    ['is_moderator', identity],
    new Query.IsModerator({}),
    undefined,
    !!identity,
  );

  const moderatedServers = useMemo(() => {
    if (!query.data) return [];
    return [...decodeStatusByServer(query.data)]
      .filter(([, isModerator]) => isModerator)
      .map(([server]) => server);
  }, [query.data]);

  return {
    isLoading: query.isLoading,
    moderatedServers,
    isModerator: moderatedServers.length > 0,
  };
}
