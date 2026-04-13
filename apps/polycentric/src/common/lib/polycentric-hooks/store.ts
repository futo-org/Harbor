import { createStore, useStore as useZustandStore } from 'zustand';
import { types } from '@polycentric/react-native';
import type { KeyPair, PolycentricClient } from '@polycentric/react-native';
import {
  getPointer,
  type PostData,
  decodePostEvent,
  parsePostId,
} from './helpers';
import { fetchPostStats } from './fetchPostStats';

const EMPTY_IDS: string[] = [];

export type PostState = {
  signedEvent: types.SignedEvent;
  decoded: PostData;
  pointer: types.Pointer;
  stats: { likes: number; dislikes: number; comments: number };
  myOpinion: types.Opinion;
  metadataFetched: boolean;
};

type FeedEntry = {
  ids: string[];
  hasMore: boolean;
};

export interface PolycentricStore {
  identities: KeyPair[];
  refreshIdentities: () => Promise<void>;

  feeds: Record<string, FeedEntry>;
  feedVersions: Record<string, number>;
  getFeedIds: (feedKey: string) => string[];
  hasFeed: (feedKey: string) => boolean;
  feedHasMore: (feedKey: string) => boolean;
  feedVersion: (feedKey: string) => number;
  setFeed: (feedKey: string, ids: string[], hasMore: boolean) => void;
  appendFeed: (feedKey: string, ids: string[], hasMore: boolean) => void;
  prependFeed: (feedKey: string, id: string) => void;
  clearFeed: (feedKey: string) => void;

  usernames: Record<string, string>;
  fetchedUsernames: Record<string, boolean>;
  ensureUsernameLoaded: (key: string, pubkey: types.PublicKey) => void;
  ingestUsernameEvent: (key: string, name: string) => void;

  posts: Record<string, PostState>;
  ingestPost: (
    postId: string,
    signedEvent: types.SignedEvent,
    decoded: PostData,
  ) => void;
  ensurePostMetadataLoaded: (postId: string) => void;
  likePost: (postId: string) => void;
  dislikePost: (postId: string) => void;

  postPageLoading: Record<string, boolean>;
  loadPostPage: (
    postId: string,
    options?: { getIsAborted?: () => boolean },
  ) => Promise<void>;
}

function toggleOpinion(
  postId: string,
  target: types.Opinion,
  get: () => PolycentricStore,
  set: (fn: (s: PolycentricStore) => Partial<PolycentricStore>) => void,
  client: PolycentricClient,
) {
  const state = get().posts[postId];
  if (!state) return;
  const prev = state.myOpinion;
  const next = prev === target ? types.Opinion.NEUTRAL : target;
  set((s) => {
    const current = s.posts[postId];
    if (!current) return s;
    const stats = { ...current.stats };
    if (prev === types.Opinion.LIKE) stats.likes--;
    if (prev === types.Opinion.DISLIKE) stats.dislikes--;
    if (next === types.Opinion.LIKE) stats.likes++;
    if (next === types.Opinion.DISLIKE) stats.dislikes++;
    return {
      posts: {
        ...s.posts,
        [postId]: { ...current, stats, myOpinion: next },
      },
    };
  });
  // TODO: setOpinion requires v2 content manager APIs
}

export function createPolycentricStore(client: PolycentricClient) {
  return createStore<PolycentricStore>()((set, get) => ({
    identities: [],
    async refreshIdentities() {
      set({ identities: await client.getKeys() });
    },

    feeds: {},
    feedVersions: {},

    getFeedIds(feedKey) {
      return get().feeds[feedKey]?.ids ?? EMPTY_IDS;
    },
    hasFeed(feedKey) {
      return feedKey in get().feeds;
    },
    feedHasMore(feedKey) {
      return get().feeds[feedKey]?.hasMore ?? false;
    },
    feedVersion(feedKey) {
      return get().feedVersions[feedKey] ?? 0;
    },

    setFeed(feedKey, ids, hasMore) {
      const existing = get().feeds[feedKey];
      if (
        existing &&
        existing.hasMore === hasMore &&
        existing.ids.length === ids.length &&
        existing.ids.every((id, i) => id === ids[i])
      ) {
        return;
      }
      set((s) => ({
        feeds: { ...s.feeds, [feedKey]: { ids, hasMore } },
      }));
    },

    appendFeed(feedKey, ids, hasMore) {
      const existing = get().feeds[feedKey];
      const existingIds = existing?.ids ?? [];
      const existingSet = new Set(existingIds);
      const deduped = ids.filter((id) => !existingSet.has(id));
      if (deduped.length === 0 && existing?.hasMore === hasMore) return;
      set((s) => ({
        feeds: {
          ...s.feeds,
          [feedKey]: { ids: [...existingIds, ...deduped], hasMore },
        },
      }));
    },

    prependFeed(feedKey, id) {
      const existing = get().feeds[feedKey];
      const existingIds = existing?.ids ?? [];
      if (existingIds[0] === id) return;
      set((s) => ({
        feeds: {
          ...s.feeds,
          [feedKey]: {
            ids: [id, ...existingIds.filter((x) => x !== id)],
            hasMore: existing?.hasMore ?? false,
          },
        },
      }));
    },

    clearFeed(feedKey) {
      set((s) => {
        const { [feedKey]: _, ...rest } = s.feeds;
        return {
          feeds: rest,
          feedVersions: {
            ...s.feedVersions,
            [feedKey]: (s.feedVersions[feedKey] ?? 0) + 1,
          },
        };
      });
    },

    usernames: {},
    fetchedUsernames: {},

    ingestUsernameEvent(key, name) {
      set((s) => ({ usernames: { ...s.usernames, [key]: name } }));
    },

    // TODO: Username querying requires queryManager which is not yet in v2
    ensureUsernameLoaded(key, _pubkey) {
      if (get().fetchedUsernames[key]) return;
      set((s) => ({
        fetchedUsernames: { ...s.fetchedUsernames, [key]: true },
      }));
    },

    posts: {},

    ingestPost(postId, signedEvent, decoded) {
      if (get().posts[postId]) return;
      set((s) => ({
        posts: {
          ...s.posts,
          [postId]: {
            signedEvent,
            decoded,
            pointer: getPointer(client, signedEvent),
            stats: { likes: 0, dislikes: 0, comments: 0 },
            myOpinion: types.Opinion.NEUTRAL,
            metadataFetched: false,
          },
        },
      }));
    },

    ensurePostMetadataLoaded(postId) {
      const state = get().posts[postId];
      if (!state) return;

      fetchPostStats(client, state.pointer)
        .then((result) => {
          set((s) => {
            const current = s.posts[postId];
            if (!current) return s;
            return {
              posts: {
                ...s.posts,
                [postId]: {
                  ...current,
                  stats: result,
                  myOpinion: result.myOpinion,
                  metadataFetched: true,
                },
              },
            };
          });
        })
        .catch(() => {});
    },

    likePost(postId) {
      toggleOpinion(postId, types.Opinion.LIKE, get, set, client);
    },

    dislikePost(postId) {
      toggleOpinion(postId, types.Opinion.DISLIKE, get, set, client);
    },

    postPageLoading: {},

    async loadPostPage(
      postId: string,
      options?: { getIsAborted?: () => boolean },
    ) {
      const feedKey = `replies:${postId}`;
      set((s) => ({
        postPageLoading: { ...s.postPageLoading, [postId]: true },
      }));
      try {
        await ensurePostLoaded(client, get, postId);
        if (options?.getIsAborted?.()) return;
        // TODO: queryReplies requires queryManager which is not yet in v2
        get().setFeed(feedKey, [], false);
        get().ensurePostMetadataLoaded(postId);
      } finally {
        set((s) => ({
          postPageLoading: { ...s.postPageLoading, [postId]: false },
        }));
      }
    },
  }));
}

async function ensurePostLoaded(
  client: PolycentricClient,
  get: () => PolycentricStore,
  postId: string,
): Promise<void> {
  if (get().posts[postId]) return;
  const parsed = parsePostId(postId);
  if (!parsed) return;
  try {
    // TODO: queryEvents/fetchEvent require queryManager which is not yet in v2
    const signedEvent: types.SignedEvent | null | undefined = null;
    if (signedEvent) {
      const decoded = decodePostEvent(signedEvent);
      if (decoded?.id === postId) {
        get().ingestPost(decoded.id, signedEvent, decoded);
      }
    }
  } catch {
    // SDK couldn't get the post
  }
}

function resolvePointer(
  get: () => PolycentricStore,
  postId: string,
): types.Pointer | undefined {
  return get().posts[postId]?.pointer;
}

function ingestEvent(
  get: () => PolycentricStore,
  ev: types.SignedEvent,
): string | null {
  const d = decodePostEvent(ev);
  if (!d) return null;
  get().ingestPost(d.id, ev, d);
  return d.id;
}

export type PolycentricStoreApi = ReturnType<typeof createPolycentricStore>;

export function useStore<T>(
  store: PolycentricStoreApi,
  selector: (state: PolycentricStore) => T,
): T {
  return useZustandStore(store, selector);
}
