import type { ServerPushResult } from '@polycentric/react-native';
import { create } from 'zustand';

/** A push to a server that failed; either a network failure or a refusal to connect. */
export interface ServerFailure {
  message: string;
  // Epoch ms of the push that failed
  at: number;
}

interface ServerFailuresStore {
  // Both identity key and server URL maps to server failures
  failures: Record<string, Record<string, ServerFailure>>;
  record: (results: ServerPushResult[], now?: number) => void;
  clearServer: (identity: string, server: string) => void;
  clearAll: () => void;
}

const failureMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** A store of failed pushes for each server of each identity. */
export const useServerFailuresStore = create<ServerFailuresStore>(
  (set, get) => ({
    failures: {},
    record: (results, now = Date.now()) => {
      const synced: Record<string, Record<string, ServerFailure>> = {};
      for (const { identity, server, error } of results) {
        synced[identity] ??= {};
        if (error !== undefined) {
          synced[identity][server] = {
            message: failureMessage(error),
            at: now,
          };
        }
      }
      set({ failures: { ...get().failures, ...synced } });
    },
    clearServer: (identity, server) =>
      set((s) => {
        const { [server]: _, ...identityFailures } = s.failures[identity] ?? {};
        return { failures: { ...s.failures, [identity]: identityFailures } };
      }),
    clearAll: () => set({ failures: {} }),
  }),
);

const NO_FAILURES: Record<string, ServerFailure> = {};

/** Get the set of server failures for a specific identity. */
export const useIdentityServerFailures = (identity: string | null) =>
  useServerFailuresStore((s) =>
    identity === null ? NO_FAILURES : (s.failures[identity] ?? NO_FAILURES),
  );
