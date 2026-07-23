import type { PolycentricClient } from '@polycentric/react-native';
import { create } from 'zustand';

type ModerationStatusState = {
  // True while a refresh is in flight (including the first one).
  isLoading: boolean;
  // Configured servers the active identity is a moderator on.
  moderatedServers: string[];
  // Whether the active identity moderates at least one configured server.
  isModerator: boolean;
  // Re-query every configured server's IsModerator and cache the yeses.
  // Servers that fail to answer count as "not a moderator". Call at app
  // load, on identity change, and whenever the server list changes.
  refresh: (client: PolycentricClient) => Promise<void>;
};

const useModerationStatus = create<ModerationStatusState>((set) => ({
  isLoading: true,
  moderatedServers: [],
  isModerator: false,
  async refresh(client) {
    if (!client.activeIdentityKey) {
      set({ isLoading: false, moderatedServers: [], isModerator: false });
      return;
    }
    set({ isLoading: true });
    const checks = await Promise.all(
      client.servers.map(async (server) => ({
        server,
        isModerator: await client.isModerator(server).catch(() => false),
      })),
    );
    const moderatedServers = checks
      .filter((c) => c.isModerator)
      .map((c) => c.server);
    set({
      isLoading: false,
      moderatedServers,
      isModerator: moderatedServers.length > 0,
    });
  },
}));

export default useModerationStatus;
