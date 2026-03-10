import { createStore, useStore as useZustandStore } from 'zustand';
import { types } from '@lib-polycentric/react-native';
import type { PolycentricClient } from '@lib-polycentric/react-native';
import { getPointer, type PostData } from './helpers';
import { fetchPostStats } from './fetchPostStats';

const EMPTY_IDS: string[] = [];

export type PostState = {
  signedEvent: types.ISignedEvent;
  decoded: PostData;
  pointer: types.IPointer;
  stats: { likes: number; dislikes: number; comments: number };
  myOpinion: types.Opinion;
  metadataFetched: boolean;
};

type FeedEntry = {
  ids: string[];
  hasMore: boolean;
};

export interface PolycentricStore {
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
  ensureUsernameLoaded: (key: string, pubkey: types.IPublicKey) => void;
  ingestUsernameEvent: (key: string, name: string) => void;

  posts: Record<string, PostState>;
  ingestPost: (
    postId: string,
    signedEvent: types.ISignedEvent,
    decoded: PostData
  ) => void;
  ensurePostMetadataLoaded: (postId: string) => void;
  likePost: (postId: string) => void;
  dislikePost: (postId: string) => void;
}

function toggleOpinion(
  postId: string,
  target: types.Opinion,
  get: () => PolycentricStore,
  set: (fn: (s: PolycentricStore) => Partial<PolycentricStore>) => void,
  client: PolycentricClient
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
  client.contentManager
    .setOpinion(state.pointer, next)
    .then(() => client.sync().catch(() => {}))
    .catch(() => {});
}

export function createPolycentricStore(client: PolycentricClient) {
  return createStore<PolycentricStore>()((set, get) => ({
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

    ensureUsernameLoaded(key, pubkey) {
      if (get().fetchedUsernames[key]) return;
      set((s) => ({
        fetchedUsernames: { ...s.fetchedUsernames, [key]: true },
      }));
      client.queryManager
        .queryUsername(pubkey)
        .then((name) => {
          if (name) {
            set((s) => ({ usernames: { ...s.usernames, [key]: name } }));
          }
        })
        .catch(() => {});
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
  }));
}

export type PolycentricStoreApi = ReturnType<typeof createPolycentricStore>;

export function useStore<T>(
  store: PolycentricStoreApi,
  selector: (state: PolycentricStore) => T
): T {
  return useZustandStore(store, selector);
}
