import { DEFAULT_IDENTITY_NAME } from '@/constants';
import {
  FeedQuery,
  PolycentricClient,
  createIdentityWithDefaultServer,
  createPolycentricClient,
  types,
  type Identity,
} from '@polycentric/react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { decodePostEvent, pubkeyStr } from './helpers';
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
  onInitialized: () => void;
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
      onInitialized();
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

        if ((await c.getAllIdentities()).length === 0) {
          await createIdentityWithDefaultServer(c, DEFAULT_SERVER);
        }

        if (cancelled) return;

        const s = createPolycentricStore(c);
        await s.getState().refreshIdentities();

        // Wire username event ingestion
        c.events.onContentCreated((event) => {
          try {
            const ev = types.Event.fromBinary(event.event);
            if (Number(ev.contentType) !== types.ContentType.USERNAME) return;
            if (!ev.system) return;
            const key = pubkeyStr(ev.system);
            if (!ev.lwwElement?.value) return;
            const name = new TextDecoder().decode(ev.lwwElement.value);
            if (name) {
              s.getState().ingestUsernameEvent(key, name);
            }
          } catch {}
        });

        setClient(c);
        setStore(s);
        setCurrentIdentity(c.currentIdentity);
        setIsLoading(false);

        void c.sync().catch((syncError) => {
          console.warn('Initial Polycentric sync failed:', syncError);
        });

        c.events.onIdentityChanged(async (identity) => {
          if (cancelled) return;
          if (!identity && (await c.getAllIdentities()).length === 0) {
            await createIdentityWithDefaultServer(c, DEFAULT_SERVER);
            await c.sync().catch(() => {});
            setCurrentIdentity(c.currentIdentity);
          } else {
            setCurrentIdentity(identity);
          }
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
      await client.switchIdentity(publicKey);
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

function ingestEvents(
  events: types.SignedEvent[],
  store: PolycentricStoreApi,
): string[] {
  const ids: string[] = [];
  const { ingestPost } = store.getState();
  for (const signedEvent of events) {
    const decoded = decodePostEvent(signedEvent);
    if (!decoded) continue;
    ingestPost(decoded.id, signedEvent, decoded);
    ids.push(decoded.id);
  }
  return ids;
}

async function readUntilPosts(
  feed: FeedQuery,
  store: PolycentricStoreApi,
): Promise<{ ids: string[]; hasMore: boolean }> {
  const allIds: string[] = [];
  let page = await feed.read();
  while (page.length > 0) {
    allIds.push(...ingestEvents(page, store));
    if (allIds.length > 0 || !feed.hasMore) break;
    page = await feed.read();
  }
  return { ids: allIds, hasMore: allIds.length > 0 && feed.hasMore };
}

function useFeedQuery(
  feedKey: string,
  createQuery: (client: PolycentricClient) => FeedQuery,
  deps: unknown[],
  options?: { enabled?: boolean; getIsAborted?: () => boolean },
): FeedHookResult {
  const { client, store, currentIdentity } = usePolycentricContext();
  const enabled = options?.enabled ?? true;
  const getIsAborted = options?.getIsAborted;

  const feedRef = useRef<FeedQuery | null>(null);
  const loadingMoreRef = useRef(false);
  const [abortedBeforeFeedApplied, setAbortedBeforeFeedApplied] =
    useState(false);

  // Subscribe to feed version (triggers refetch on clear/invalidate)
  const version = useStore(store, (s) => s.feedVersions[feedKey] ?? 0);

  // Fetch on mount, identity change, or external invalidation. Skip applying result if aborted (e.g. screen blurred).
  useEffect(() => {
    if (!enabled) return;
    setAbortedBeforeFeedApplied(false);
    const feed = createQuery(client);
    feedRef.current = feed;
    readUntilPosts(feed, store)
      .then(({ ids, hasMore }) => {
        if (getIsAborted?.()) {
          setAbortedBeforeFeedApplied(true);
          return;
        }
        store.getState().setFeed(feedKey, ids, hasMore);
      })
      .catch((err) => {
        console.error(`[feed:${feedKey}] fetch failed:`, err);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, store, feedKey, enabled, currentIdentity, version, ...deps]);

  // Don't show loading if we aborted before applying feed to the store (e.g. user left screen).
  const items = useStore(store, (s) => s.feeds[feedKey]?.ids ?? EMPTY_IDS);
  const hasFeed = useStore(store, (s) => feedKey in s.feeds);
  const isLoading = enabled && !hasFeed && !abortedBeforeFeedApplied;
  const hasMore = useStore(store, (s) => s.feeds[feedKey]?.hasMore ?? false);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !feedRef.current?.hasMore) return;
    loadingMoreRef.current = true;
    try {
      const { ids, hasMore } = await readUntilPosts(feedRef.current, store);
      if (getIsAborted?.()) return;
      store.getState().appendFeed(feedKey, ids, hasMore);
    } catch (err) {
      console.error(`[feed:${feedKey}] loadMore failed:`, err);
    } finally {
      loadingMoreRef.current = false;
    }
  }, [store, feedKey, getIsAborted]);

  const refresh = useCallback(() => {
    const feed = createQuery(client);
    feedRef.current = feed;
    readUntilPosts(feed, store)
      .then(({ ids, hasMore }) => {
        if (getIsAborted?.()) return;
        store.getState().setFeed(feedKey, ids, hasMore);
      })
      .catch((err) => {
        console.error(`[feed:${feedKey}] refresh failed:`, err);
      });
  }, [client, createQuery, store, feedKey, getIsAborted]);

  return { items, isLoading, error: null, loadMore, hasMore, refresh };
}

const EMPTY_IDS: string[] = [];

export function useExploreFeed(options?: {
  perServerLimit?: number;
  enabled?: boolean;
}): FeedHookResult {
  return useFeedQuery(
    'explore',
    (c) => c.queryManager.queryExploreFeed(options?.perServerLimit),
    [options?.perServerLimit],
    { enabled: options?.enabled ?? true },
  );
}

export function useFollowingFeed(options?: {
  limit?: number;
  enabled?: boolean;
}): FeedHookResult {
  return useFeedQuery(
    'following',
    (c) => c.queryManager.queryFollowingFeed(options?.limit ?? 20),
    [options?.limit],
    { enabled: options?.enabled ?? true },
  );
}

export function useAuthorFeed(
  system: types.PublicKey,
  limit?: number,
  options?: { getIsAborted?: () => boolean },
): FeedHookResult {
  const systemKey = pubkeyStr(system);
  return useFeedQuery(
    `author:${systemKey}`,
    (c) => c.queryManager.queryAuthorFeed(system, limit ?? 200),
    [systemKey, limit],
    { getIsAborted: options?.getIsAborted },
  );
}

export function useLikesFeed(options?: {
  limit?: number;
  enabled?: boolean;
  getIsAborted?: () => boolean;
}): FeedHookResult {
  return useFeedQuery(
    'likes',
    (c) => c.queryManager.queryLikesFeed(options?.limit ?? 20),
    [options?.limit],
    { enabled: options?.enabled ?? true, getIsAborted: options?.getIsAborted },
  );
}

export function useProfile(
  system: types.PublicKey,
  options?: { getIsAborted?: () => boolean },
): ProfileHookResult {
  const { client, currentIdentity } = usePolycentricContext();
  const systemKey = pubkeyStr(system);
  const getIsAborted = options?.getIsAborted;

  const [description, setDescription] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const identityKey = currentIdentity
    ? pubkeyStr(currentIdentity.keyPair.publicKey)
    : '';

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    client
      .syncEventsForSystem(system)
      .then(() => {
        if (cancelled || getIsAborted?.()) return;
        return client.queryManager.queryDescription(system);
      })
      .then((desc) => {
        if (cancelled) return;
        if (!getIsAborted?.()) setDescription(desc ?? null);
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        if (!getIsAborted?.())
          setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, systemKey, identityKey, refreshKey]);

  useEffect(() => {
    const listener = (event: types.SignedEvent) => {
      try {
        const ev = types.Event.fromBinary(event.event);
        if (Number(ev.contentType) !== types.ContentType.DESCRIPTION) return;
        const eventSystemKey = ev.system?.key ? pubkeyStr(ev.system) : '';
        if (eventSystemKey === systemKey) {
          setRefreshKey((k) => k + 1);
        }
      } catch {}
    };
    client.events.onContentCreated(listener);
    return () => {
      client.events.offContentCreated(listener);
    };
  }, [client, systemKey]);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return { description, isLoading, error, refresh };
}

export function useIdentities() {
  const { store } = usePolycentricContext();
  return useStore(store, (s) => s.identities);
}

export function useCurrentIdentity() {
  const { client, currentIdentity, switchIdentity } = usePolycentricContext();

  const isCurrentIdentity = useCallback(
    (pubkey: types.PublicKey) => {
      if (!currentIdentity) return false;
      return pubkeyStr(currentIdentity.keyPair.publicKey) === pubkeyStr(pubkey);
    },
    [currentIdentity],
  );

  return {
    identity: currentIdentity,
    publicKey: currentIdentity?.keyPair.publicKey ?? null,
    client,
    isCurrentIdentity,
    switchIdentity,
  };
}

export function useFollowStatus(system: types.PublicKey): FollowStatusResult {
  const { client, store, currentIdentity } = usePolycentricContext();

  const currentPubkey = currentIdentity?.keyPair.publicKey;
  const systemKey = pubkeyStr(system);
  const identityKey = currentPubkey ? pubkeyStr(currentPubkey) : '';
  const isSelf = systemKey === identityKey;

  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const busyRef = useRef(false);

  useEffect(() => {
    if (isSelf || !currentPubkey) {
      setIsFollowing(false);
      setIsLoading(false);
      return;
    }
    const follows = client.queryManager.queryFollows(currentPubkey);
    setIsFollowing(follows.some((f) => pubkeyStr(f) === systemKey));
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, systemKey, identityKey, refreshKey]);

  const toggleFollow = useCallback(async () => {
    if (busyRef.current || isSelf) return;
    busyRef.current = true;
    try {
      if (isFollowing) {
        await client.contentManager.createUnfollow(system);
      } else {
        await client.contentManager.createFollow(system);
      }
      await client.sync();
      setIsFollowing(!isFollowing);
      if (!isFollowing) {
        await client.syncEventsForSystem(system).catch(() => {});
      }
      store.getState().clearFeed('following');
    } catch (err) {
      console.error('Failed to toggle follow:', err);
    } finally {
      busyRef.current = false;
    }
  }, [client, system, isFollowing, isSelf, store, systemKey]);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return { isFollowing, isLoading, toggleFollow, refresh };
}

export function useUsername(pubkey: types.PublicKey): string {
  const { store } = usePolycentricContext();
  const key = pubkeyStr(pubkey);
  const stablePubkey = useMemo(() => pubkey, [key]);

  // Zustand selector — rerenders only when this name changes
  const name = useStore(store, (s) => s.usernames[key]);

  useEffect(() => {
    if (!key) return;
    store.getState().ensureUsernameLoaded(key, stablePubkey);
  }, [store, key, stablePubkey]);

  return name ?? DEFAULT_IDENTITY_NAME;
}
