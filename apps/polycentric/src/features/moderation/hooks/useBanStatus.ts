import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { setQueryCache, useQuery } from '@/src/common/query/hooks/useQuery';
import {
  decodeStatusByServer,
  encodeStatusByServer,
  FetchMode,
  Query,
} from '@polycentric/react-native';
import { useMemo } from 'react';
import useModerationStatus from './useModerationStatus';

export interface BanStatusState {
  // True while the IsBanned query is in flight.
  isLoading: boolean;
  // serverUrl -> banned, for the servers that answered. A server that
  // failed to answer is absent (i.e. counts as "not banned").
  bannedByServer: Map<string, boolean>;
  // Bans or unbans `targetIdentity` on one server
  // (`IdentityService.SetBanStatus`), updating the map on success.
  setBanned: (server: string, banned: boolean) => Promise<void>;
}

/**
 * Which of the active identity's moderated servers (from
 * `useModerationStatus`) the identity `targetIdentity` is banned on —
 * one `IdentityService.IsBanned` fan-out limited to those servers, as
 * the endpoint is moderator-gated — plus a mutation to change one
 * server's status (`IdentityService.SetBanStatus`). Subscribed through
 * `useQuery` only while `enabled` is true, refetching when it flips
 * back to true.
 */
export default function useBanStatus(
  targetIdentity: string,
  enabled: boolean,
): BanStatusState {
  const client = usePolycentric();
  const { moderatedServers: servers } = useModerationStatus();

  const queryKey = ['is_banned', targetIdentity, ...servers];
  const query = useQuery(
    queryKey,
    new Query.IsBanned({ targetIdentity }),
    { fetchMode: FetchMode.Default, servers },
    enabled && servers.length > 0,
  );

  const bannedByServer = useMemo(
    () =>
      query.data
        ? decodeStatusByServer(query.data)
        : new Map<string, boolean>(),
    [query.data],
  );

  const setBanned = async (server: string, next: boolean) => {
    await client.setBanStatus(server, targetIdentity, next);
    // Patch the shared cache so the toggle shows immediately, and drop
    // the stale rust-side entry so the next fan-out re-asks the servers.
    const updated = new Map(bannedByServer).set(server, next);
    setQueryCache(queryKey, { data: encodeStatusByServer(updated) });
    client.core.invalidateQuery(queryKey);
  };

  return { isLoading: query.isLoading, bannedByServer, setBanned };
}
