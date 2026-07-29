import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { useCallback, useEffect, useState } from 'react';

export interface BanStatusState {
  // True while the initial IsBanned query is in flight.
  isLoading: boolean;
  // True while a SetBanStatus mutation is in flight.
  isUpdating: boolean;
  banned: boolean;
  setBanned: (banned: boolean) => Promise<void>;
}

/**
 * Whether `targetIdentity` is banned on `server`
 * (`IdentityService.IsBanned`), plus a mutation to change it
 * (`IdentityService.SetBanStatus`). The active identity must be a
 * moderator on `server`.
 */
export default function useBanStatus(
  server: string,
  targetIdentity: string,
): BanStatusState {
  const client = usePolycentric();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [banned, setBannedState] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setBannedState(false);
    client
      .isBanned(targetIdentity)
      .then((byServer) => {
        if (!cancelled) setBannedState(byServer.get(server) ?? false);
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
  }, [client, server, targetIdentity]);

  const setBanned = useCallback(
    async (next: boolean) => {
      setIsUpdating(true);
      try {
        await client.setBanStatus(server, targetIdentity, next);
        setBannedState(next);
      } finally {
        setIsUpdating(false);
      }
    },
    [client, server, targetIdentity],
  );

  return { isLoading, isUpdating, banned, setBanned };
}
