import { DEFAULT_IDENTITY_NAME } from '@/src/common/constants';
import { publicEnv } from '@/src/common/util/env';
import useBlocks from '@/src/features/block/hooks/useBlocks';
import useFollows from '@/src/features/follow/hooks/useFollows';
import useReposts from '@/src/features/post/hooks/useReposts';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import {
  type PolycentricClient,
  createPolycentricClient,
  type types,
  type IdentityState,
} from '@polycentric/react-native';
import { HARBOR_APPLICATION } from '@/src/common/util/application';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform, Text, View } from 'react-native';
import { Atoms, useTheme } from '../../theme';
import { registerForPushNotifications } from '../notifications/registerPushToken';
import { useNotificationNavigation } from '../notifications/useNotificationNavigation';
import {
  PolycentricContext,
  usePolycentricContext,
  type PolycentricContextValue,
} from './context';
import {
  createPolycentricStore,
  useStore,
  type PolycentricStoreApi,
} from './store';
import useReactions from '@/src/features/reaction/useReactions';

export {
  usePolycentric,
  usePolycentricContext,
  type PolycentricContextValue,
} from './context';

// Defaults for local development
const DEFAULT_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

/**
 * Comma-separated list of gRPC-web server URLs the client seeds
 * `client.servers` with. Read from `EXPO_PUBLIC_POLYCENTRIC_SEED_SERVERS`
 * (the runtime value from server.js wins over the build-time one); falls
 * back to `http://<host>:3000` for local dev.
 */
export const DEFAULT_SEED_SERVERS: string[] = (() => {
  const raw = (
    publicEnv(
      'EXPO_PUBLIC_POLYCENTRIC_SEED_SERVERS',
      process.env.EXPO_PUBLIC_POLYCENTRIC_SEED_SERVERS,
    ) ?? ''
  ).trim();
  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parsed.length > 0 ? parsed : [`http://${DEFAULT_HOST}:3000`];
})();

/** First seed server — used by identity onboarding helpers. */
export const DEFAULT_SERVER = DEFAULT_SEED_SERVERS[0]!;

/**
 * Comma-separated list of gRPC-web URLs for the notification service the
 * client registers push tokens with. Read from
 * `EXPO_PUBLIC_POLYCENTRIC_NOTIFICATION_SERVERS`; falls back to
 * `http://<host>:3001` for local dev (the notifications service's default
 * gRPC port).
 */
export const DEFAULT_NOTIFICATION_SERVERS: string[] = (() => {
  const raw = (
    publicEnv(
      'EXPO_PUBLIC_POLYCENTRIC_NOTIFICATION_SERVERS',
      process.env.EXPO_PUBLIC_POLYCENTRIC_NOTIFICATION_SERVERS,
    ) ?? ''
  ).trim();
  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parsed.length > 0 ? parsed : [`http://${DEFAULT_HOST}:3001`];
})();

/**
 * Comma-separated list of verifier-bot base URLs that 'Platform' claims
 * request verification from. Read from
 * `EXPO_PUBLIC_POLYCENTRIC_VERIFIER_SERVERS`; falls back to
 * `http://<host>:3002` for local dev (the verifier bot's default port).
 */
export const DEFAULT_VERIFIER_SERVERS: string[] = (() => {
  const raw = (
    publicEnv(
      'EXPO_PUBLIC_POLYCENTRIC_VERIFIER_SERVERS',
      process.env.EXPO_PUBLIC_POLYCENTRIC_VERIFIER_SERVERS,
    ) ?? ''
  ).trim();
  const parsed = raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter((s) => s.length > 0);
  return parsed.length > 0 ? parsed : [`http://${DEFAULT_HOST}:3002`];
})();

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

  // Route to the deep link carried by a tapped push notification, once the
  // router is mounted (provider initialized without error).
  useNotificationNavigation(!isLoading && !error);

  useEffect(() => {
    if (!isLoading) {
      onInitialized?.();
    }
  }, [isLoading, onInitialized]);

  const currentIdentityKey = currentIdentity?.identityKey;
  useEffect(() => {
    if (!client || !currentIdentityKey) return;
    void (async () => {
      try {
        const token = await registerForPushNotifications();
        if (!token) return;
        await client.registerPushNotifications(DEFAULT_NOTIFICATION_SERVERS, {
          service: 'expo',
          token,
        });
      } catch (err) {
        console.warn('Push registration failed:', err);
      }
    })();
  }, [client, currentIdentityKey]);

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
          application: HARBOR_APPLICATION,
        });

        if (cancelled) return;

        const s = createPolycentricStore(c);
        await s.getState().refreshIdentities();

        setClient(c);
        setStore(s);
        setCurrentIdentity(c.identityManager.resolveIdentity());

        // Only sync when we already have an identity to sync for.
        if (c.activeIdentityKey) {
          // Read follows from the local store immediately — don't gate
          // the UI on the network sync. The sync runs in parallel and
          // re-refreshes once new events have been pulled in.
          useFollows.getState().refresh(c);
          useReposts.getState().refresh(c);
          useReactions.getState().refresh(c);
          useBlocks.getState().refresh(c);
          void c
            .sync()
            .then(() =>
              Promise.all([
                useFollows.getState().refresh(c),
                useReposts.getState().refresh(c),
                useReactions.getState().refresh(c),
                useBlocks.getState().refresh(c),
              ]),
            )
            .catch((syncError) => {
              console.warn('Initial Polycentric sync failed:', syncError);
            });
        }

        setIsLoading(false);

        c.events.onKeyPairChanged(async () => {
          if (cancelled) return;
          setCurrentIdentity(c.identityManager.resolveIdentity());
          await s.getState().refreshIdentities();
          // TODO: Cleanup this up
          useFollows.getState().refresh(c);
          useReposts.getState().refresh(c);
          useReactions.getState().refresh(c);
          useBlocks.getState().refresh(c);
        });

        // Identity onboarding (create / claim) publishes an Identity event.
        // Set to current identity
        c.events.onContentCreated(async ({ content }) => {
          if (cancelled) return;
          if (content?.contentBody.oneofKind !== 'identity') return;
          setCurrentIdentity(c.identityManager.resolveIdentity());
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
    setCurrentIdentity(client.identityManager.resolveIdentity());
  }, [client]);

  const value = useMemo<PolycentricContextValue | null>(() => {
    if (!client || !store) return null;
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
    hasIdentity: !!activeIdentityKey,
    client,
    isCurrentIdentity,
    switchIdentity,
  };
}

export function useUsername(identityKey: string | null | undefined): string {
  const profile = useProfile(identityKey);
  return profile.name ?? DEFAULT_IDENTITY_NAME;
}

/**
 * False when the client runs on the in-memory storage fallback (private
 * browsing) — identities created there would be lost on reload, so
 * signup/pairing should not be offered.
 */
export function useIsStoragePersistent(): boolean {
  const { client } = usePolycentricContext();
  return client?.persistentStorage ?? true;
}
