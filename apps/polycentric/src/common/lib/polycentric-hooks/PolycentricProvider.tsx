import { DEFAULT_IDENTITY_NAME } from '@/src/common/constants';
import {
  PolycentricClient,
  createIdentityWithDefaultServer,
  createPolycentricClient,
  types,
  v2,
} from '@polycentric/react-native';

type Identity = v2.Identity;
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { pubkeyStr, decodeV2PostBundle } from './helpers';
import {
  createPolycentricStore,
  useStore,
  type PolycentricStoreApi,
} from './store';

export interface PolycentricContextValue {
  client: PolycentricClient;
  store: PolycentricStoreApi;
  isLoading: boolean;
  isReady: boolean;
  error: Error | null;
  currentIdentity: Identity | null;
  switchIdentity: (publicKey: types.PublicKey) => Promise<void>;
}

interface FeedHookResult {
  items: string[];
  isLoading: boolean;
  error: Error | null;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  refresh: () => void;
}

interface ProfileHookResult {
  description: string | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

interface FollowStatusResult {
  isFollowing: boolean;
  isLoading: boolean;
  toggleFollow: () => Promise<void>;
  refresh: () => void;
}

const PolycentricContext = createContext<PolycentricContextValue | null>(null);

// Defaults for local development
const DEFAULT_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

export const DEFAULT_SERVER =
  (process.env.EXPO_PUBLIC_POLYCENTRIC_SERVER ?? '').trim() ||
  `http://${DEFAULT_HOST}:8787`;

interface PolycentricProviderProps {
  children: ReactNode;
  loadingComponent?: ReactNode;
  onInitialized?: () => void;
}

function DefaultLoadingComponent() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ActivityIndicator />
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
): Promise<Identity | null> {
  const state = await client.getCurrentIdentity();
  return state.identity ?? null;
}

export function PolycentricProvider({
  children,
  loadingComponent,
  onInitialized,
}: PolycentricProviderProps) {
  const [client, setClient] = useState<PolycentricClient | null>(null);
  const [store, setStore] = useState<PolycentricStoreApi | null>(null);
  const [currentIdentity, setCurrentIdentity] = useState<Identity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!isLoading) {
      onInitialized?.();
    }
  }, [isLoading, onInitialized]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const c = await createPolycentricClient({
          databaseName: 'polycentric.db',
        });

        if (cancelled) return;

        if ((await c.getKeys()).length === 0) {
          await createIdentityWithDefaultServer(c, DEFAULT_SERVER);
        }

        if (cancelled) return;

        const s = createPolycentricStore(c);
        await s.getState().refreshIdentities();

        setClient(c);
        setStore(s);
        setCurrentIdentity(await resolveIdentity(c));
        setIsLoading(false);

        void c.sync().catch((syncError) => {
          console.warn('Initial Polycentric sync failed:', syncError);
        });

        c.events.onKeyPairChanged(async () => {
          if (cancelled) return;
          if ((await c.getKeys()).length === 0) {
            await createIdentityWithDefaultServer(c, DEFAULT_SERVER);
            await c.sync().catch(() => {});
          }
          setCurrentIdentity(await resolveIdentity(c));
          await s.getState().refreshIdentities();
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
      await client.switchKeyPair(publicKey);
      await client.sync().catch(() => {});
    },
    [client],
  );

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
    };
  }, [client, store, isLoading, error, currentIdentity, switchIdentity]);

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

// TODO: Feed queries require queryManager which is not yet implemented in v2.
// These hooks return empty/no-op results until the query layer is ported.

const EMPTY_IDS: string[] = [];
const NOOP = async () => {};
const NOOP_SYNC = () => {};

const EMPTY_FEED: FeedHookResult = {
  items: EMPTY_IDS,
  isLoading: false,
  error: null,
  loadMore: NOOP,
  hasMore: false,
  refresh: NOOP_SYNC,
};

/** Call the gRPC-web ListEvents endpoint directly via fetch. */
async function grpcListEvents(
  serverUrl: string,
): Promise<v2.ListEventsResponse> {
  const request = v2.ListEventsRequest.toBinary(
    v2.ListEventsRequest.create({}),
  );

  // gRPC-web frame: 1-byte flag (0 = data) + 4-byte big-endian length + body
  const frame = new Uint8Array(5 + request.length);
  frame[0] = 0;
  new DataView(frame.buffer).setUint32(1, request.length, false);
  frame.set(request, 5);

  const res = await fetch(
    `${serverUrl}/polycentric.v2.EventSyncService/ListEvents`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/grpc-web+proto',
        accept: 'application/grpc-web+proto',
      },
      body: frame,
    },
  );

  if (!res.ok) throw new Error(`gRPC-web error: ${res.status}`);

  const buf = new Uint8Array(await res.arrayBuffer());
  // First frame: skip 5-byte header to get the response protobuf
  const responseBytes = buf.slice(5);
  // The response may include a trailers frame at the end; find the data
  // frame length from the header and only decode that many bytes.
  const dataLen = new DataView(buf.buffer, buf.byteOffset).getUint32(1, false);
  return v2.ListEventsResponse.fromBinary(responseBytes.slice(0, dataLen));
}

export function useExploreFeed(options?: {
  perServerLimit?: number;
  enabled?: boolean;
}): FeedHookResult {
  const { client, store } = usePolycentricContext();
  const enabled = options?.enabled ?? true;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchFeed = useCallback(async () => {
    if (client.servers.length === 0) return;
    setIsLoading(true);
    setError(null);
    try {
      const ids: string[] = [];
      for (const server of client.servers) {
        try {
          const response = await grpcListEvents(server);
          for (const bundle of response.eventBundles) {
            const decoded = decodeV2PostBundle(bundle);
            if (!decoded) continue;
            store
              .getState()
              .ingestPost(decoded.id, decoded.signedEvent, decoded);
            ids.push(decoded.id);
          }
        } catch (e) {
          console.warn(`Failed to fetch from ${server}:`, e);
        }
      }
      store.getState().setFeed('explore', ids, false);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, [client, store]);

  useEffect(() => {
    if (enabled) fetchFeed();
  }, [enabled, fetchFeed]);

  const items = useStore(store, (s) => s.feeds['explore']?.ids ?? EMPTY_IDS);
  const hasMore = useStore(store, (s) => s.feeds['explore']?.hasMore ?? false);

  return {
    items,
    isLoading,
    error,
    loadMore: NOOP,
    hasMore,
    refresh: fetchFeed,
  };
}

export function useFollowingFeed(_options?: {
  limit?: number;
  enabled?: boolean;
}): FeedHookResult {
  return EMPTY_FEED;
}

export function useAuthorFeed(
  _system: types.PublicKey,
  _limit?: number,
  _options?: { getIsAborted?: () => boolean },
): FeedHookResult {
  return EMPTY_FEED;
}

export function useLikesFeed(_options?: {
  limit?: number;
  enabled?: boolean;
  getIsAborted?: () => boolean;
}): FeedHookResult {
  return EMPTY_FEED;
}

export function useProfile(
  _system: types.PublicKey,
  _options?: { getIsAborted?: () => boolean },
): ProfileHookResult {
  return {
    description: null,
    isLoading: false,
    error: null,
    refresh: NOOP_SYNC,
  };
}

export function useIdentities() {
  const { store } = usePolycentricContext();
  return useStore(store, (s) => s.identities);
}

export function useCurrentIdentity() {
  const { client, currentIdentity, switchIdentity } = usePolycentricContext();

  const publicKey = client.currentKeyPair?.publicKey ?? null;

  const isCurrentIdentity = useCallback(
    (pubkey: types.PublicKey) => {
      if (!publicKey) return false;
      return pubkeyStr(publicKey) === pubkeyStr(pubkey);
    },
    [publicKey],
  );

  return {
    identity: currentIdentity,
    publicKey,
    client,
    isCurrentIdentity,
    switchIdentity,
  };
}

export function useFollowStatus(_system: types.PublicKey): FollowStatusResult {
  return {
    isFollowing: false,
    isLoading: false,
    toggleFollow: NOOP,
    refresh: NOOP_SYNC,
  };
}

export function useUsername(pubkey: types.PublicKey): string {
  const { store } = usePolycentricContext();
  const key = pubkeyStr(pubkey);
  const stablePubkey = useMemo(() => pubkey, [key]);

  const name = useStore(store, (s) => s.usernames[key]);

  useEffect(() => {
    if (!key) return;
    store.getState().ensureUsernameLoaded(key, stablePubkey);
  }, [store, key, stablePubkey]);

  return name ?? DEFAULT_IDENTITY_NAME;
}
