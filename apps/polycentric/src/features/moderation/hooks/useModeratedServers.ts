import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { useEffect, useState } from 'react';

export interface ModeratedServersState {
  isLoading: boolean;
  // Servers the active identity is a moderator on.
  servers: string[];
}

/**
 * Asks every configured server whether the active identity is a
 * moderator (`IdentityService.IsModerator`) and returns the ones that
 * said yes. Servers that fail to answer are treated as "not a
 * moderator". Queries only while `enabled` is true.
 */
export default function useModeratedServers(
  enabled: boolean,
): ModeratedServersState {
  const client = usePolycentric();
  const [state, setState] = useState<ModeratedServersState>({
    isLoading: true,
    servers: [],
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState({ isLoading: true, servers: [] });
    (async () => {
      const checks = await Promise.all(
        client.servers.map(async (server) => ({
          server,
          isModerator: await client.isModerator(server).catch(() => false),
        })),
      );
      if (cancelled) return;
      setState({
        isLoading: false,
        servers: checks.filter((c) => c.isModerator).map((c) => c.server),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [client, enabled]);

  return state;
}
