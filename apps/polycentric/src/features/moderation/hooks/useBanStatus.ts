import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { useCallback, useEffect, useState } from 'react';
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
 * server's status (`IdentityService.SetBanStatus`). Queries only while
 * `enabled` is true, refetching when it flips back to true.
 */
export default function useBanStatus(
  targetIdentity: string,
  enabled: boolean,
): BanStatusState {
  const client = usePolycentric();
  const servers = useModerationStatus((s) => s.moderatedServers);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [bannedByServer, setBannedByServer] = useState<Map<string, boolean>>(
    new Map(),
  );

  useEffect(() => {
    if (!enabled) return;
    if (servers.length === 0) {
      setBannedByServer(new Map());
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setBannedByServer(new Map());
    client
      .isBanned(targetIdentity, servers)
      .then((byServer) => {
        if (!cancelled) setBannedByServer(byServer);
      })
      .catch((err) => {
        console.error('Failed to fetch ban status:', err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, targetIdentity, servers, enabled]);

  const setBanned = useCallback(
    async (server: string, next: boolean) => {
      await client.setBanStatus(server, targetIdentity, next);
      setBannedByServer((prev) => new Map(prev).set(server, next));
    },
    [client, targetIdentity],
  );

  return { isLoading, bannedByServer, setBanned };
}
