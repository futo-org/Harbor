import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { useCallback, useEffect, useState } from 'react';

export interface BanListState {
  isLoading: boolean;
  // Identities banned on the server, most recently banned first.
  bans: string[];
  // Unbans `identity` and removes it from `bans`.
  unban: (identity: string) => Promise<void>;
}

/**
 * The identities banned on `server` (`IdentityService.ListBans`), plus
 * a mutation to unban one (`IdentityService.SetBanStatus`). The active
 * identity must be a moderator on `server`. Queries only while
 * `enabled` is true.
 */
export default function useBanList(
  server: string,
  enabled: boolean,
): BanListState {
  const client = usePolycentric();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [bans, setBans] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setIsLoading(true);
    setBans([]);
    client
      .listBans(server)
      .then((banned) => {
        if (!cancelled) setBans(banned);
      })
      .catch((err) => {
        console.error('Failed to fetch ban list:', err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, server, enabled]);

  const unban = useCallback(
    async (identity: string) => {
      await client.setBanStatus(server, identity, false);
      setBans((prev) => prev.filter((banned) => banned !== identity));
    },
    [client, server],
  );

  return { isLoading, bans, unban };
}
