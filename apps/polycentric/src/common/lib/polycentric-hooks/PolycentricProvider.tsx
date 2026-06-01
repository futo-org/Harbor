import { DEFAULT_IDENTITY_NAME } from '@/src/common/constants';
import useFollows from '@/src/features/follow/hooks/useFollows';
import useReposts from '@/src/features/post/hooks/useReposts';
import {
  PolycentricClient,
  createPolycentricClient,
  types,
  type IdentityState,
} from '@polycentric/react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform, Text, View } from 'react-native';
import { Atoms, useTheme } from '../../theme';
import { registerForPushNotifications } from '../notifications/registerPushToken';
import {
  createPolycentricStore,
  useStore,
  type PolycentricStoreApi,
} from './store';
import useReactions from '@/src/features/reaction/useReactions';

export interface PolycentricContextValue {
  client: PolycentricClient;
  store: PolycentricStoreApi;
  isLoading: boolean;
  isReady: boolean;
  error: Error | null;
  currentIdentity: IdentityState | null;
  switchIdentity: (publicKey: types.PublicKey) => Promise<void>;
  refreshCurrentIdentity: () => Promise<void>;
}

const PolycentricContext = createContext<PolycentricContextValue | null>(null);

// Defaults for local development
const DEFAULT_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

/**
 * Comma-separated list of gRPC-web server URLs the client seeds
 * `client.servers` with. Read from `EXPO_PUBLIC_POLYCENTRIC_SEED_SERVERS`;
 * falls back to `http://<host>:3000` for local dev.
 */
export const DEFAULT_SEED_SERVERS: string[] = (() => {
  const raw = (process.env.EXPO_PUBLIC_POLYCENTRIC_SEED_SERVERS ?? '').trim();
  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parsed.length > 0 ? parsed : [`http://${DEFAULT_HOST}:3000`];
})();

/** First seed server — used by identity onboarding helpers. */
export const DEFAULT_SERVER = DEFAULT_SEED_SERVERS[0]!;

interface PolycentricProviderProps {
  children: ReactNode;
  loadingComponent?: ReactNode;
  onInitialized?: () => void;
}

function DefaultLoadingComponent() {
  const { theme } = useTheme();
  return (
    <View
      style={[
        theme.atoms.bg,
        Atoms.flex_1,
        Atoms.align_center,
        Atoms.justify_center,
      ]}
    >
      {/* <ActivityIndicator /> */}
    </View>
  );
}

function DefaultErrorComponent({ error }: { error: Error }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
      }}
    >
      <Text style={{ fontWeight: '600', marginBottom: 8 }}>
        Failed to start Polycentric
      </Text>
      <Text selectable>{error.message}</Text>
    </View>
  );
}

async function resolveIdentity(
  client: PolycentricClient,
): Promise<IdentityState | null> {
  if (!client.activeIdentityKey) return null;
  const state = await client.identityManager.getCurrent();
  return state.identityKey ? state : null;
}

export function PolycentricProvider({
  children,
  loadingComponent,
  onInitialized,
}: PolycentricProviderProps) {
  const [client, setClient] = useState<PolycentricClient | null>(null);
  const [store, setStore] = useState<PolycentricStoreApi | null>(null);
  const [currentIdentity, setCurrentIdentity] = useState<IdentityState | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!isLoading) {
      onInitialized?.();
    }
  }, [isLoading, onInitialized]);

  useEffect(() => {
    if (!client || !currentIdentity) return;
    void (async () => {
      try {
        const token = await registerForPushNotifications();
        if (!token) return;
        await client.registerPushNotifications(DEFAULT_SEED_SERVERS, {
          service: 'expo',
          token,
        });
      } catch (err) {
        console.warn('Push registration failed:', err);
      }
    })();
  }, [client, currentIdentity?.identityKey]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // PolycentricClient.initialize() guarantees a keypair exists on
        // every device. Identity (the published Identity doc) is a separate
        // concept — the onboarding gate handles creating or pairing one.
        const c = await createPolycentricClient({
          databaseName: 'polycentric.db',
          seedServers: DEFAULT_SEED_SERVERS,
        });

        if (cancelled) return;

        c.servers = [DEFAULT_SERVER];

        const s = createPolycentricStore(c);
        await s.getState().refreshIdentities();

        setClient(c);
        setStore(s);
        setCurrentIdentity(await resolveIdentity(c));

        // Only sync when we already have an identity to sync for.
        if (c.activeIdentityKey) {
          // Read follows from the local store immediately — don't gate
          // the UI on the network sync. The sync runs in parallel and
          // re-refreshes once new events have been pulled in.
          useFollows.getState().refresh(c);
          useReposts.getState().refresh(c);
          useReactions.getState().refresh(c);
          void c
            .sync()
            .then(() =>
              Promise.all([
                useFollows.getState().refresh(c),
                useReposts.getState().refresh(c),
                useReactions.getState().refresh(c),
              ]),
            )
            .catch((syncError) => {
              console.warn('Initial Polycentric sync failed:', syncError);
            });
        }

        setIsLoading(false);

        c.events.onKeyPairChanged(async () => {
          if (cancelled) return;
          setCurrentIdentity(await resolveIdentity(c));
          await s.getState().refreshIdentities();
          // TODO: Cleanup this up
          useFollows.getState().refresh(c);
          useReposts.getState().refresh(c);
          useReactions.getState().refresh(c);
        });

        // Identity onboarding (create / claim) publishes an Identity event.
        // Set to current identity
        c.events.onContentCreated(async ({ content }) => {
          if (cancelled) return;
          if (content?.contentBody.oneofKind !== 'identity') return;
          setCurrentIdentity(await resolveIdentity(c));
        });
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to initialize PolycentricProvider:', err);
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const switchIdentity = useCallback(
    async (publicKey: types.PublicKey) => {
      if (!client) return;
      await client.keyPairManager.switchKeyPair(publicKey);
      await client.sync().catch(() => {});
    },
    [client],
  );

  const refreshCurrentIdentity = useCallback(async () => {
    if (!client) return;
    setCurrentIdentity(await resolveIdentity(client));
  }, [client]);

  const value = useMemo<PolycentricContextValue | null>(() => {
    return {
      client,
      store,
      isLoading,
      isReady: !isLoading && !error,
      error,
      currentIdentity,
      switchIdentity,
      refreshCurrentIdentity,
    };
  }, [
    client,
    store,
    isLoading,
    error,
    currentIdentity,
    switchIdentity,
    refreshCurrentIdentity,
  ]);

  if (error) {
    return <DefaultErrorComponent error={error} />;
  }

  if (!value || isLoading) {
    return <>{loadingComponent ?? <DefaultLoadingComponent />}</>;
  }

  return (
    <PolycentricContext.Provider value={value}>
      {children}
    </PolycentricContext.Provider>
  );
}

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

export function useIdentities() {
  const { store } = usePolycentricContext();
  return useStore(store, (s) => s.identities);
}

export function useCurrentIdentity() {
  const { client, currentIdentity, switchIdentity } = usePolycentricContext();

  const activeIdentityKey = currentIdentity?.identityKey ?? null;

  const isCurrentIdentity = useCallback(
    (identityKey: string | null | undefined) => {
      if (!activeIdentityKey || !identityKey) return false;
      return activeIdentityKey === identityKey;
    },
    [activeIdentityKey],
  );

  return {
    identity: currentIdentity,
    identityKey: activeIdentityKey,
    client,
    isCurrentIdentity,
    switchIdentity,
  };
}

export function useUsername(_identityKey: string | null | undefined): string {
  const name = undefined;

  return name ?? DEFAULT_IDENTITY_NAME;
}
