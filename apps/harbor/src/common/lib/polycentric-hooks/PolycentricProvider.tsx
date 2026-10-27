import { DEFAULT_IDENTITY_NAME } from '@/src/common/constants';
import { publicEnv } from '@/src/common/util/env';
import useBlocks from '@/src/features/block/hooks/useBlocks';
import useFollows from '@/src/features/follow/hooks/useFollows';
import useReposts from '@/src/features/post/hooks/useReposts';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import {
  type PolycentricClient,
  createPolycentricClient,
  type IdentityState,
  v2,
} from '@polycentric/react-native';
import { HARBOR_APPLICATION } from '@/src/common/util/application';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { Platform, Text, View } from 'react-native';
import { Atoms, useTheme } from '../../theme';
import { registerForPushNotifications } from '../notifications/registerPushToken';
import { useNotificationNavigation } from '../notifications/useNotificationNavigation';
import {
  PolycentricContext,
  usePolycentricContext,
  type PolycentricContextValue,
} from './context';
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
 * `client.servers` with. Read from `EXPO_PUBLIC_HARBOR_SEED_SERVERS`
 * (the runtime value from server.js wins over the build-time one); falls
 * back to `http://<host>:3000` for local dev.
 */
export const DEFAULT_SEED_SERVERS: string[] = (() => {
  const raw = (
    publicEnv(
      'EXPO_PUBLIC_HARBOR_SEED_SERVERS',
      process.env.EXPO_PUBLIC_HARBOR_SEED_SERVERS,
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
 * `EXPO_PUBLIC_HARBOR_NOTIFICATION_SERVERS`; falls back to
 * `http://<host>:3001` for local dev (the notifications service's default
 * gRPC port).
 */
export const DEFAULT_NOTIFICATION_SERVERS: string[] = (() => {
  const raw = (
    publicEnv(
      'EXPO_PUBLIC_HARBOR_NOTIFICATION_SERVERS',
      process.env.EXPO_PUBLIC_HARBOR_NOTIFICATION_SERVERS,
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
 * `EXPO_PUBLIC_HARBOR_VERIFIER_SERVERS`; falls back to
 * `http://<host>:3002` for local dev (the verifier bot's default port).
 */
export const DEFAULT_VERIFIER_SERVERS: string[] = (() => {
  const raw = (
    publicEnv(
      'EXPO_PUBLIC_HARBOR_VERIFIER_SERVERS',
      process.env.EXPO_PUBLIC_HARBOR_VERIFIER_SERVERS,
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
  // The root stack, which hides the splash, never mounts on this path.
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

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

type Bootstrap = { client: PolycentricClient };

const BOOTSTRAP_KEY = '__polycentricBootstrap';
type BootstrapGlobal = typeof globalThis & {
  [BOOTSTRAP_KEY]?: Promise<Bootstrap>;
};

function bootstrapClient(): Promise<Bootstrap> {
  const global = globalThis as BootstrapGlobal;
  global[BOOTSTRAP_KEY] ??= (async () => {
    // A keypair always exists; onboarding creates or pairs the identity.
    const client = await createPolycentricClient({
      databaseName: 'polycentric.db',
      seedServers: DEFAULT_SEED_SERVERS,
      application: HARBOR_APPLICATION,
    });

    if (client.activeIdentityKey) {
      // Refresh from current local state
      useFollows.getState().refresh(client);
      useReposts.getState().refresh(client);
      useReactions.getState().refresh(client);
      useBlocks.getState().refresh(client);
    }

    return { client };
  })().catch((err) => {
    delete global[BOOTSTRAP_KEY];
    throw err;
  });
  return global[BOOTSTRAP_KEY];
}

export function PolycentricProvider({
  children,
  loadingComponent,
  onInitialized,
}: PolycentricProviderProps) {
  const [client, setClient] = useState<PolycentricClient | null>(null);
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

  useEffect(() => client?.startLiveSync(), [client]);

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
    let ready: Bootstrap | null = null;

    const refresh = async ({ client }: Bootstrap) => {
      setCurrentIdentity(client.identityManager.resolveIdentity());
      await Promise.all([
        useFollows.getState().refresh(client),
        useReposts.getState().refresh(client),
        useReactions.getState().refresh(client),
        useBlocks.getState().refresh(client),
      ]);
    };

    const handleKeyPairChanged = async () => {
      if (cancelled || !ready) return;

      try {
        await refresh(ready);
      } catch (err) {
        console.error('Refresh after login failed:', err);
      }
    };

    // Keep identity state up to date.
    const handleContentCreated = ({
      signedEvent,
      content,
    }: {
      signedEvent: { eventBytes: Uint8Array };
      content?: { contentBody: { oneofKind?: string } };
    }) => {
      if (cancelled || !ready) return;
      if (content?.contentBody.oneofKind !== 'identity') return;

      const event = v2.Event.fromBinary(signedEvent.eventBytes);
      if (event.key?.identity !== ready.client.activeIdentityKey) return;

      setCurrentIdentity(ready.client.identityManager.resolveIdentity());
    };

    // Refresh stores when we pull from remote servers
    const handlePulled = async (identityKey: string) => {
      if (cancelled || !ready) return;

      const { client } = ready;
      if (identityKey !== client.activeIdentityKey) return;

      try {
        await refresh(ready);
      } catch (err) {
        console.warn('Failed to refresh stores after pull:', err);
      }
    };

    (async () => {
      try {
        const result = await bootstrapClient();
        if (cancelled) return;
        ready = result;

        const { client: c } = result;
        setClient(c);
        setCurrentIdentity(c.identityManager.resolveIdentity());
        setIsLoading(false);

        c.events.onKeyPairChanged(handleKeyPairChanged);
        c.events.onContentCreated(handleContentCreated);
        c.events.onPulled(handlePulled);

        // Do an initial sync now that we have registered the listener
        void c.sync().catch((syncError) => {
          console.warn('Initial Polycentric sync failed:', syncError);
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
      ready?.client.events.offKeyPairChanged(handleKeyPairChanged);
      ready?.client.events.offContentCreated(handleContentCreated);
      ready?.client.events.offPulled(handlePulled);
    };
  }, []);

  const refreshCurrentIdentity = useCallback(async () => {
    if (!client) return;
    setCurrentIdentity(client.identityManager.resolveIdentity());
  }, [client]);

  const value = useMemo<PolycentricContextValue | null>(() => {
    if (!client) return null;
    return {
      client,
      isLoading,
      isReady: !isLoading && !error,
      error,
      currentIdentity,
      refreshCurrentIdentity,
    };
  }, [client, isLoading, error, currentIdentity, refreshCurrentIdentity]);

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

export function useCurrentIdentity() {
  const { client, currentIdentity } = usePolycentricContext();

  const activeIdentityKey = currentIdentity?.identityKey ?? null;

  return {
    identity: currentIdentity,
    identityKey: activeIdentityKey,
    hasIdentity: !!activeIdentityKey,
    client,
  };
}

export function useUsername(
  identityKey: string | null | undefined,
  options?: { fallbackName?: string | null },
): string {
  const profile = useProfile(identityKey);
  if (profile.name) return profile.name;
  if (options?.fallbackName) return options.fallbackName;
  if (profile.isLoading || !profile.isResolved) return '…';
  // An empty fallback reaches here too, and hides the default name.
  return options?.fallbackName ?? DEFAULT_IDENTITY_NAME;
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
