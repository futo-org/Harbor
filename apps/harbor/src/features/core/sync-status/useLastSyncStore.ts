import type { ServerPushResult } from '@polycentric/react-native';
import { create } from 'zustand';

interface LastSyncStore {
  // Maps identity keys to epoch ms of its last server sync
  lastSync: Record<string, number>;
  record: (results: ServerPushResult[], now?: number) => void;
  clearAll: () => void;
}

/** When each identity last pushed its events servers successfully. */
export const useLastSyncStore = create<LastSyncStore>((set) => ({
  lastSync: {},
  record: (results, now = Date.now()) => {
    const synced = new Set(
      results.filter((r) => r.error === undefined).map((r) => r.identity),
    );
    if (synced.size === 0) return;
    set((s) => ({
      lastSync: {
        ...s.lastSync,
        ...Object.fromEntries([...synced].map((identity) => [identity, now])),
      },
    }));
  },
  clearAll: () => set({ lastSync: {} }),
}));

/** Get the time an identity last synced to servers successfully */
export const useLastSync = (identityKey: string | null) =>
  useLastSyncStore((s) =>
    identityKey === null ? undefined : s.lastSync[identityKey],
  );
