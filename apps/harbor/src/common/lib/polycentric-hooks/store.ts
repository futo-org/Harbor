import { createStore, useStore as useZustandStore } from 'zustand';
import type { KeyPair, PolycentricClient } from '@polycentric/react-native';

export interface PolycentricStore {
  identities: KeyPair[];
  refreshIdentities: () => Promise<void>;
}

export function createPolycentricStore(client: PolycentricClient) {
  return createStore<PolycentricStore>()((set, get) => ({
    identities: [],
    async refreshIdentities() {
      set({ identities: await client.keyPairManager.getKeys() });
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
