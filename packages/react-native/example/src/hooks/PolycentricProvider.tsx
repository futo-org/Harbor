import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from 'react';
import {
  PolycentricClient,
  ReactNativeCryptoManager,
  FeedQuery,
  types,
} from '@polycentric/react-native';
import {
  createPolycentricStore,
  useStore,
  type PolycentricStoreApi,
} from './store';
import { pubkeyStr, decodePostEvent, pointerToPostId } from './helpers';
const DEFAULT_IDENTITY_NAME = 'Anon';

type Identity = {
  keyPair: {
    keyType: number;
    privateKey: types.PrivateKey;
    publicKey: types.PublicKey;
    processId?: types.IProcess;
  };
  process: types.IProcess;
};

export interface PolycentricContextValue {
  client: PolycentricClient;
  store: PolycentricStoreApi;
  isLoading: boolean;
  isReady: boolean;
  error: Error | null;
  currentIdentity: Identity | null;
  switchIdentity: (publicKey: types.IPublicKey) => Promise<void>;
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

interface RepliesHookResult {
  items: types.ISignedEvent[];
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

import { Platform } from 'react-native';

const DEFAULT_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
export const DEFAULT_SERVER =
  (process.env.POLYCENTRIC_SERVER ?? '').trim() ||
  `http://${DEFAULT_HOST}:8081`;

interface PolycentricProviderProps {
  children: ReactNode;
  loadingComponent?: ReactNode;
}

export function PolycentricProvider({
  children,
  loadingComponent,
}: PolycentricProviderProps) {
  const [client, setClient] = useState<PolycentricClient | null>(null);
  const [store, setStore] = useState<PolycentricStoreApi | null>(null);
  const [currentIdentity, setCurrentIdentity] = useState<Identity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const c = await PolycentricClient.create({
          cryptoManager: new ReactNativeCryptoManager(),
          databaseName: 'polycentric.db',
        });

        if (cancelled) return;

        if (!c.hasIdentity()) {
          await c.createIdentity(DEFAULT_SERVER);
        }

        await c.sync().catch(() => {});

        if (cancelled) return;

        const s = createPolycentricStore(c);

        // Wire username event ingestion
        c.events.onContentCreated((event) => {
          try {
            const ev = types.Event.decode(event.event ?? new Uint8Array());
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

        c.events.onIdentityChanged((identity) => {
          if (!cancelled) {
            setCurrentIdentity(identity);
          }
        });
      } catch (err) {
        if (!cancelled) {
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
    async (publicKey: types.IPublicKey) => {
      if (!client) return;
      await client.switchIdentity(publicKey);
      await client.sync().catch(() => {});
    },
    [client]
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

  if (!value || isLoading) {
    return <>{loadingComponent ?? null}</>;
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
      'usePolycentricContext must be used within PolycentricProvider'
    );
  return ctx;
}

export function usePolycentric(): PolycentricClient {
  const { client, isReady } = usePolycentricContext();
  if (!isReady) throw new Error('PolycentricClient is not ready');
  return client;
}

function ingestEvents(
  events: types.ISignedEvent[],
  store: PolycentricStoreApi
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
  store: PolycentricStoreApi
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
  options?: { enabled?: boolean }
): FeedHookResult {
  const { client, store, currentIdentity } = usePolycentricContext();
  const enabled = options?.enabled ?? true;

  const feedRef = useRef<FeedQuery | null>(null);
  const loadingMoreRef = useRef(false);

  // Subscribe to feed version (triggers refetch on clear/invalidate)
  const version = useStore(store, (s) => s.feedVersions[feedKey] ?? 0);

  // Fetch on mount, identity change, or external invalidation
  useEffect(() => {
    if (!enabled) return;
    const feed = createQuery(client);
    feedRef.current = feed;
    readUntilPosts(feed, store)
      .then(({ ids, hasMore }) => {
        store.getState().setFeed(feedKey, ids, hasMore);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, store, feedKey, enabled, currentIdentity, version, ...deps]);

  // Select feed state from zustand
  const items = useStore(store, (s) => s.feeds[feedKey]?.ids ?? EMPTY_IDS);
  const hasFeed = useStore(store, (s) => feedKey in s.feeds);
  const isLoading = enabled && !hasFeed;
  const hasMore = useStore(store, (s) => s.feeds[feedKey]?.hasMore ?? false);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !feedRef.current?.hasMore) return;
    loadingMoreRef.current = true;
    try {
      const { ids, hasMore } = await readUntilPosts(feedRef.current, store);
      store.getState().appendFeed(feedKey, ids, hasMore);
    } catch {
    } finally {
      loadingMoreRef.current = false;
    }
  }, [store, feedKey]);

  const refresh = useCallback(() => {
    const feed = createQuery(client);
    feedRef.current = feed;
    readUntilPosts(feed, store)
      .then(({ ids, hasMore }) => {
        store.getState().setFeed(feedKey, ids, hasMore);
      })
      .catch(() => {});
  }, [client, createQuery, store, feedKey]);

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
    { enabled: options?.enabled ?? true }
  );
}

export function useFollowingFeed(options?: {
  limit?: number;
  enabled?: boolean;
}): FeedHookResult {
  return useFeedQuery(
    'following',
    (c) => c.queryManager.queryFollowingFeed(options?.limit),
    [options?.limit],
    { enabled: options?.enabled ?? true }
  );
}

export function useAuthorFeed(
  system: types.IPublicKey,
  limit?: number
): FeedHookResult {
  const systemKey = pubkeyStr(system);
  return useFeedQuery(
    `author:${systemKey}`,
    (c) => c.queryManager.queryAuthorFeed(system, limit),
    [systemKey, limit]
  );
}

export function useLikesFeed(options?: {
  limit?: number;
  enabled?: boolean;
}): FeedHookResult {
  return useFeedQuery(
    'likes',
    (c) => c.queryManager.queryLikesFeed(options?.limit),
    [options?.limit],
    { enabled: options?.enabled ?? true }
  );
}

export function useProfile(system: types.IPublicKey): ProfileHookResult {
  const { client, currentIdentity } = usePolycentricContext();
  const systemKey = pubkeyStr(system);

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

    client.ffiBridge
      .syncEventsForSystem(system)
      .then(() => {
        if (cancelled) return;
        return client.queryManager.queryDescription(system);
      })
      .then((desc) => {
        if (!cancelled) {
          setDescription(desc ?? null);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, systemKey, identityKey, refreshKey]);

  useEffect(() => {
    const listener = (event: types.SignedEvent) => {
      try {
        const ev = types.Event.decode(event.event ?? new Uint8Array());
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

export function useReplies(pointer: types.IPointer): RepliesHookResult {
  const { client, store } = usePolycentricContext();

  const [items, setItems] = useState<types.ISignedEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const pointerKey = pointer.system?.key
    ? pubkeyStr(pointer.system) + ':' + Number(pointer.logicalClock)
    : '';
  const postId = pointerToPostId(pointer);

  useEffect(() => {
    if (!pointerKey) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    client.queryManager
      .queryReplies(pointer)
      .then((result) => {
        if (!cancelled) {
          setItems(result);
          setIsLoading(false);
          if (postId) store.getState().ensurePostMetadataLoaded(postId);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, pointerKey, refreshKey]);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return { items, isLoading, error, refresh };
}

export function useCurrentIdentity() {
  const { client, currentIdentity, switchIdentity } = usePolycentricContext();

  const isCurrentIdentity = useCallback(
    (pubkey: types.IPublicKey) => {
      if (!currentIdentity) return false;
      return pubkeyStr(currentIdentity.keyPair.publicKey) === pubkeyStr(pubkey);
    },
    [currentIdentity]
  );

  return {
    identity: currentIdentity,
    publicKey: currentIdentity?.keyPair.publicKey ?? null,
    client,
    isCurrentIdentity,
    switchIdentity,
  };
}

export function useFollowStatus(system: types.IPublicKey): FollowStatusResult {
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
        await client.ffiBridge.syncEventsForSystem(system).catch(() => {});
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

export function useUsername(pubkey: types.IPublicKey): string {
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
