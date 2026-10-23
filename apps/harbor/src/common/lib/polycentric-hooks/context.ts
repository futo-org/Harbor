import type {
  IdentityState,
  PolycentricClient,
} from '@polycentric/react-native';
import { createContext, useContext } from 'react';
import type { PolycentricStoreApi } from './store';

export interface PolycentricContextValue {
  client: PolycentricClient;
  store: PolycentricStoreApi;
  isLoading: boolean;
  isReady: boolean;
  error: Error | null;
  currentIdentity: IdentityState | null;
  refreshCurrentIdentity: () => Promise<void>;
}

export const PolycentricContext = createContext<PolycentricContextValue | null>(
  null,
);

export function usePolycentricContext(): PolycentricContextValue {
  const ctx = useContext(PolycentricContext);
  if (!ctx)
    throw new Error(
      'usePolycentricContext must be used within PolycentricProvider',
    );
  return ctx;
}

export function usePolycentric(): PolycentricClient {
  const { client, isReady } = usePolycentricContext();
  if (!isReady) throw new Error('PolycentricClient is not ready');
  return client;
}
