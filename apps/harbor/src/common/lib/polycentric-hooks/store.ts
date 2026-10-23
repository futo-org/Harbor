import { createStore, useStore as useZustandStore } from 'zustand';
import type {
  KeyPair,
  LoginOverview,
  PolycentricClient,
} from '@polycentric/react-native';

export interface PolycentricStore {
  logins: LoginOverview[];
  refreshLogins: () => Promise<void>;
}

export function createPolycentricStore(client: PolycentricClient) {
  return createStore<PolycentricStore>()((set, get) => ({
    logins: [],
    async refreshLogins() {
      set({ logins: await client.storage.logins.listLogins() });
    },
  }));
}

export type PolycentricStoreApi = ReturnType<typeof createPolycentricStore>;

export function useStore<T>(
  store: PolycentricStoreApi,
  selector: (state: PolycentricStore) => T,
): T {
  return useZustandStore(store, selector);
}
