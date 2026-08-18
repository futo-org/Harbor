import {
  decodeFeedItems,
  decodeLabelsBundle,
  decodePostBundle,
  type PostData,
  type PostLabel,
} from '@/src/common/lib/polycentric-hooks/helpers';
import {
  isUnderQueryKey,
  type QueryKey,
  useQueryStore,
} from '@/src/common/query/hooks/useQuery';
import {
  CounterOverlay,
  type Reaction,
  ReactionOverlay,
  type PostEntry,
  type PostOverlay,
} from './overlayTypes';
import { FeedSort, v2 } from '@polycentric/react-native';
import { useEffect } from 'react';
import { create } from 'zustand';
import {
  applyPostOverlay,
  patchPostOverlay,
  updatePostEntry,
} from './overlayOps';

/** Orders a sortable feed can be sorted by. */
export type FeedSortOption = 'top' | 'latest';

export function feedSortBy(sort: FeedSortOption): FeedSort {
  return sort === 'top' ? FeedSort.Top : FeedSort.Latest;
}

/** Every feed lives under the `feed` prefix, so `['feed']` covers them all. */
export const feedQueryKeys = {
  /** Omit `sort` for the partition covering every sort. */
  following: (identity: string, sort?: FeedSortOption): string[] =>
    sort
      ? ['feed', 'following', identity, sort]
      : ['feed', 'following', identity],
  identity: (identity: string): string[] => ['feed', 'identity', identity],
  /** Omit `sort` for the partition covering every sort. */
  explore: (identity: string, sort?: FeedSortOption): string[] =>
    sort ? ['feed', 'explore', identity, sort] : ['feed', 'explore', identity],
};

export function threadQueryKey(parentId: string, limit = 0): string[] {
  return ['post_thread', parentId, String(limit)];
}

/**
 * Use this instead of `post.id` when `post` could be a repost and you
 * need a unique key.
 */
function postId(post: PostData): string {
  return post.repostId ?? post.id;
}

/** Use this as a stable reference for an empty feed output */
const EMPTY_FEED: PostData[] = Object.freeze([] as PostData[]) as PostData[];

/**
 * Snapshot of a feed's posts and overlays.
 * Fields that store cached data should be `undefined` if we have not yet
 * processed the latest query data or overlays.
 */
type FeedEntry = {
  /** Latest query data that our posts are derived from. */
  queryData: ArrayBuffer;

  /** Cached page info corresponding to the query data above. */
  pageInfo: v2.PageInfo | undefined;

  /** Cached output array. */
  output: PostData[] | undefined;

  /** Maps post ids to `PostEntry` objects. */
  posts: Map<string, PostEntry>;

  /** Post ids of the posts to inject to the start of the feed. */
  frontInjections: string[];

  /** Maps a post id to a list of posts to inject directly after it in the feed. */
  replyInjections: Map<string, string[]>;
};

/**
 * Store deduplicated, cached post data along with local overlays for new changes.
 * Useful for loading feeds and posts without superfluous rerenders while taking
 * into account new changes that servers may not have processed yet.
 * With the zustand store, this allows reactively handling feed queries and overlays.
 */
type FeedDataStoreState = {
  /**
   * Maps a feed query key string its data.
   */
  feedData: Map<string, FeedEntry>;

  /**
   * Return the stored `FeedEntry` if it matches the provided query data or derive a new one.
   * Returns `undefined` if the query data is undefined.
   * The caller should ensure that any cached data is pulled to the store later
   * with `pullCachedFeed()`.
   */
  getFeedEntry: (
    queryKey: string,
    queryData: ArrayBuffer | undefined,
    decode: DecodeFn,
  ) => FeedEntry | undefined;

  /**
   * Pull in cached output from the map of derived feed data.
   * We want to do this before new data is received, since the data in the store
   * is used as a base for new data to merge with.
   */
  pullCachedFeed: (queryKey: string, queryData: ArrayBuffer) => void;

  /**
   * If we have any cached data for the corresponding feed, then inject this
   * post to the top of the feed locally.
   */
  injectPostToFront: (queryKey: string, post: PostData) => void;

  /**
   * Inject `post` right after its parent in the feed, if we have any cached data.
   */
  injectPostReply: (queryKey: string, post: PostData) => void;

  /**
   * Alter or create a local overlay for a post to increase or decrease
   * the post's reply count by `amount`.
   */
  alterReplyCount: (queryKey: string, postId: string, amount: number) => void;

  /**
   * Merge existing overlay with updated client reaction state for a post.
   */
  injectReaction: (
    queryKey: string,
    postId: string,
    prev: Reaction | undefined,
    next: Reaction | undefined,
    overlayTallies: boolean,
  ) => void;
};

/**
 * Maps a query's data field to a `FeedEntry` object derived from the feed's data.
 * This is intended to memoize feed entry derivations in hooks.
 * Storing the result in here allows us to keep stable references to `PostData`
 * objects for multiple consumers within a render as well as between multiple
 * renders.
 * We key on the query data and assume that consumers using the same query data
 * object have the same key and overlay state.
 */
const derivedFeedCache: WeakMap<ArrayBuffer, FeedEntry> = new WeakMap();

/** Callback used for deriving feed entries from query response data. */
type DecodeFn = (data: ArrayBuffer) => [PostData[], v2.PageInfo | undefined];

function decodeFeedResponse(
  data: ArrayBuffer,
): [PostData[], v2.PageInfo | undefined] {
  const response = v2.GetFeedResponse.fromBinary(new Uint8Array(data));
  return [decodeFeedItems(response), response.pageInfo];
}

function decodeThreadResponse(
  data: ArrayBuffer,
): [PostData[], v2.PageInfo | undefined] {
  const response = v2.GetPostThreadResponse.fromBinary(new Uint8Array(data));

  const labelMap = new Map<string, PostLabel[]>();
  for (const hint of response.eventHints) {
    if (!hint.eventBundle) continue;
    const labels = decodeLabelsBundle(hint.eventBundle);
    if (labels) {
      const existing = labelMap.get(labels.targetPostId);
      labelMap.set(
        labels.targetPostId,
        existing ? [...existing, ...labels.labels] : labels.labels,
      );
    }
  }

  const decoded: PostData[] = [];
  for (const bundle of response.thread) {
    const d = decodePostBundle(bundle);
    if (d) {
      const labels = labelMap.get(d.id);
      if (labels) d.labels = labels;
      decoded.push(d);
    }
  }

  return [decoded, undefined];
}

export const useFeedDataStore = create<FeedDataStoreState>((set, get) => {
  // --- Helpers for deriving entries ---

  /**
   * Update posts map based on non-repost posts in the feed items.
   * Returns a list of the reposts in the feed items.
   */
  const initialPostUpdates = (
    posts: Map<string, PostEntry>,
    items: PostData[],
  ): PostData[] => {
    const reposts: PostData[] = [];

    for (const post of items) {
      if (post.repostId) {
        reposts.push(post);
        continue;
      }

      const entry = updatePostEntry(posts.get(postId(post)), post);
      posts.set(postId(post), entry);
    }

    return reposts;
  };

  /**
   * Use the feed response's reposts to update the post entries and obtain the
   *  final values to output for the posts present in the feed items.
   */
  const updateUsingReposts = (
    posts: Map<string, PostEntry>,
    reposts: PostData[],
  ): void => {
    for (const repost of reposts) {
      if (!repost.repostId) continue;

      // Update upstream post
      const asNonRepost: PostData = {
        ...repost,
        repostId: undefined,
        repostedBy: undefined,
      };

      const upstreamEntry = updatePostEntry(posts.get(repost.id), asNonRepost);
      posts.set(repost.id, upstreamEntry);

      // Fake the repost object to look like the original post + overlay but
      // directly from the server.
      applyPostOverlay(repost, upstreamEntry.overlay);
      const repostEntry = updatePostEntry(posts.get(repost.repostId), repost);
      posts.set(repost.repostId, repostEntry);
    }
  };

  /**
   * Return the output after injecting the reply injections to each of the
   * input arrays.
   * Any post with an id in seenPosts will be excluded.
   */
  const withRepliesInjected = (
    posts: Map<string, PostEntry>,
    inputs: PostData[][],
    replyInjections: Map<string, string[]>,
    seenPosts: Set<string>,
  ): PostData[] => {
    const output: PostData[] = [];

    /** Recursively inject a post's reply injections */
    const injectPostReplies = (post: PostData): void => {
      const injections = replyInjections.get(postId(post));
      if (!injections) return;

      for (const replyId of injections) {
        if (seenPosts.has(replyId)) continue;

        const reply = posts.get(replyId);
        if (!reply) continue;

        output.push(reply.post);
        seenPosts.add(replyId);
        injectPostReplies(reply.post);
      }
    };

    for (const input of inputs) {
      for (const post of input) {
        output.push(post);
        injectPostReplies(post);
      }
    }

    return output;
  };

  /** Derive a new feed entry from the provided query data and stored overlays. */
  const deriveEntry = (
    queryKey: string,
    queryData: ArrayBuffer,
    decode: DecodeFn,
  ): FeedEntry => {
    let [items, pageInfo] = decode(queryData);

    const old = get().feedData.get(queryKey);
    const posts: Map<string, PostEntry> = new Map(old?.posts);
    const frontInjections =
      old?.frontInjections && old.queryData === queryData
        ? old.frontInjections
        : [];
    const replyInjections: Map<string, string[]> =
      old?.replyInjections && old.queryData === queryData
        ? old.replyInjections
        : new Map();

    // Update posts map with new server data.
    // We will update with repost data afterward
    const reposts = initialPostUpdates(posts, items);

    // Update using repost data.
    // PostData objects for the posts in the feed items list should be
    // finalized now
    updateUsingReposts(posts, reposts);

    // Gather feed items
    const feedResponseItems: PostData[] = [];

    // Injections will be skipped for posts that are found in the feed items.
    const seenPosts = new Set<string>();

    for (const post of items) {
      const entry = posts.get(postId(post));
      if (!entry) continue;

      feedResponseItems.push(entry.post);
      seenPosts.add(postId(post));
    }

    // Handle front injections
    // Injections may be skipped if we have already seen a post with the same id

    const frontInjectedItems: PostData[] = [];

    for (const id of frontInjections) {
      if (seenPosts.has(id)) continue;

      const post = posts.get(id)?.post;
      if (!post) continue;

      seenPosts.add(id);
      frontInjectedItems.push(post);
    }

    // Gather output
    let output = withRepliesInjected(
      posts,
      [frontInjectedItems, feedResponseItems],
      replyInjections,
      seenPosts,
    );

    // Ensure stable output when empty
    if (output.length === 0) {
      output = EMPTY_FEED;
    }

    // Keep page info stable when possible
    if (queryData === old?.queryData && old?.pageInfo) {
      pageInfo = old.pageInfo;
    }

    return {
      queryData,
      pageInfo,
      frontInjections,
      replyInjections,
      output,
      posts,
    };
  };

  /**
   * Boilerplate for most functions that modify the overlays.
   * Pull from the derived feed cache if needed and return useful data.
   * Caller should invoke `purgeCachedEntry()` once they are sure their changes
   * will be committed to the store to prevent stale cache data from being read.
   */
  const prepareOverlayMod = (
    state: FeedDataStoreState,
    queryKey: string,
  ): {
    queryData: ArrayBuffer | undefined;
    feedData: Map<string, FeedEntry>;
    existing: FeedEntry | undefined;
    purgeCachedEntry: () => void;
  } => {
    let queryData = useQueryStore.getState().queries.get(queryKey)?.data;
    const feedData = new Map(state.feedData);

    // Pull cached outputs so that the next read gets the latest
    // overlays.
    if (queryData) {
      const cached = derivedFeedCache.get(queryData);

      if (cached) {
        feedData.set(queryKey, cached);
      }
    }

    const existing = feedData.get(queryKey);
    queryData = queryData ?? existing?.queryData;

    // Caller must purge the cached data and force a recompute on the next read.
    const purgeCachedEntry = () => {
      if (queryData) derivedFeedCache.delete(queryData);
    };

    return { queryData, feedData, existing, purgeCachedEntry };
  };

  /**
   * Boilerplate for functions that alter a single post's overlay.
   * `update` receives the current entry and returns the new overlay.
   */
  const modifyPostOverlay = (
    state: FeedDataStoreState,
    queryKey: string,
    postId: string,
    update: (oldPost: PostEntry) => PostOverlay | undefined,
  ): Partial<FeedDataStoreState> => {
    const { queryData, feedData, existing, purgeCachedEntry } =
      prepareOverlayMod(state, queryKey);

    if (!queryData) return state;
    if (!existing) return state;

    const oldPost = existing.posts.get(postId);
    if (!oldPost) return state;

    purgeCachedEntry();

    const overlay = update(oldPost);

    // Reapply the overlay to a fresh copy of the untouched server data.
    const newPost = { ...oldPost.originalPost };
    applyPostOverlay(newPost, overlay);

    const posts = new Map(existing.posts);
    posts.set(postId, { ...oldPost, post: newPost, overlay });
    feedData.set(queryKey, { ...existing, output: undefined, posts });
    return { feedData };
  };

  return {
    feedData: new Map(),

    getFeedEntry: (queryKey, queryData, decode) => {
      if (!queryData) return undefined;

      // Check store
      const stored = get().feedData.get(queryKey);
      if (stored && stored.queryData === queryData && stored.output) {
        return stored;
      }

      // Check cache map
      const cached = derivedFeedCache.get(queryData);
      if (cached) {
        return cached;
      }

      // Derive new output
      const newEntry = deriveEntry(queryKey, queryData, decode);
      derivedFeedCache.set(queryData, newEntry);
      return newEntry;
    },

    pullCachedFeed: (queryKey, queryData) => {
      set((state) => {
        const cached = derivedFeedCache.get(queryData);
        if (!cached) return state;

        derivedFeedCache.delete(queryData);

        const next = new Map(state.feedData);
        next.set(queryKey, cached);
        return { feedData: next };
      });
    },

    injectPostToFront: (queryKey, post) => {
      set((state) => {
        const { queryData, feedData, existing, purgeCachedEntry } =
          prepareOverlayMod(state, queryKey);

        if (!queryData) return state;
        if (!existing) return state;

        purgeCachedEntry();

        const frontInjections: string[] = [
          postId(post),
          ...existing.frontInjections,
        ];
        const posts: Map<string, PostEntry> = new Map(existing.posts);
        if (!posts.has(postId(post)))
          posts.set(postId(post), {
            originalPost: post,
            post,
            overlay: undefined,
          });

        const next: FeedEntry = {
          output: undefined,
          pageInfo: existing.pageInfo,
          frontInjections,
          replyInjections: existing.replyInjections,
          posts,
          queryData,
        };

        feedData.set(queryKey, next);
        return { feedData };
      });
    },

    injectPostReply: (queryKey, post) => {
      set((state) => {
        const { queryData, feedData, existing, purgeCachedEntry } =
          prepareOverlayMod(state, queryKey);

        if (!queryData) return state;
        if (!existing) return state;

        const posts: Map<string, PostEntry> = new Map(existing.posts);
        if (!posts.has(postId(post)))
          posts.set(postId(post), {
            originalPost: post,
            post,
            overlay: undefined,
          });

        const parentId = post.reply?.parentId;
        if (!parentId) return state;

        purgeCachedEntry();

        const replyInjections = new Map(existing.replyInjections);
        const existingReplies = replyInjections.get(parentId) ?? [];
        const newReplies: string[] = [postId(post), ...existingReplies];
        replyInjections.set(parentId, newReplies);

        const entry = {
          output: undefined,
          pageInfo: existing.pageInfo,
          frontInjections: existing.frontInjections,
          replyInjections,
          posts,
          queryData,
        };

        feedData.set(queryKey, entry);
        return { feedData };
      });
    },

    alterReplyCount: (queryKey, postId, amount) => {
      set((state) =>
        modifyPostOverlay(state, queryKey, postId, (oldPost) => {
          const base =
            oldPost.overlay?.replyCount ??
            new CounterOverlay(oldPost.originalPost.replyCount ?? 0, 0);
          const capped = Math.max(amount, -base.get());
          const replyCount = base.localUpdate(capped, true);
          return patchPostOverlay(oldPost.overlay, { replyCount });
        }),
      );
    },

    injectReaction: (queryKey, postId, prev, next, overlayTallies) => {
      set((state) =>
        modifyPostOverlay(state, queryKey, postId, (oldPost) => {
          const oldReaction = oldPost.overlay?.reaction;
          const server = oldPost.originalPost;
          const reaction = oldReaction
            ? oldReaction.localUpdate(prev, next, server, overlayTallies)
            : ReactionOverlay.create(prev, next, server, overlayTallies);
          return patchPostOverlay(oldPost.overlay, { reaction });
        }),
      );
    },
  };
});

/**
 * Return any cached list of posts for the given args if present or derive a new
 * list.
 * Valid for any query that returns a `GetFeedResponse`.
 * Keeps stable references between calls whenever possible.
 * Transparently handles local client overlays.
 */
export function useFeedWithOverlays(
  queryKey: QueryKey,
  queryData: ArrayBuffer | undefined,
): PostData[] {
  const key = queryKey.join('\0');
  const output = useFeedDataStore(
    (s) =>
      s.getFeedEntry(key, queryData, decodeFeedResponse)?.output ?? EMPTY_FEED,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: output's value is a dependency within pullCachedFeed()
  useEffect(() => {
    if (queryData) useFeedDataStore.getState().pullCachedFeed(key, queryData);
  }, [key, queryData, output]);

  return output;
}

/**
 * Return any cached list of posts for the given args if present or derive a new
 * list.
 * Valid for any query that returns a `GetPostThreadResponse`.
 * Keeps stable references between calls whenever possible.
 * Transparently handles local client overlays.
 */
export function useThreadWithOverlays(
  queryKey: QueryKey,
  queryData: ArrayBuffer | undefined,
): PostData[] {
  const key = queryKey.join('\0');
  const output = useFeedDataStore(
    (s) =>
      s.getFeedEntry(key, queryData, decodeThreadResponse)?.output ??
      EMPTY_FEED,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: output's value is a dependency within pullCachedFeed()
  useEffect(() => {
    if (queryData) useFeedDataStore.getState().pullCachedFeed(key, queryData);
  }, [key, queryData, output]);

  return output;
}

/**
 * Return any cached page info for the given args or decode the data and derive
 * the page info.
 */
export function useFeedPageInfo(
  queryKey: QueryKey,
  queryData: ArrayBuffer | undefined,
): v2.PageInfo | undefined {
  const key = queryKey.join('\0');
  const pageInfo = useFeedDataStore(
    (s) => s.getFeedEntry(key, queryData, decodeFeedResponse)?.pageInfo,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: pageInfo's value is a dependency within pullCachedFeed()
  useEffect(() => {
    if (queryData) useFeedDataStore.getState().pullCachedFeed(key, queryData);
  }, [key, queryData, pageInfo]);

  return pageInfo;
}

/**
 * Optimistically prepend a post into a feed
 */
/** Cached feed keys under `queryKey`, which is a partition of them. */
function cachedKeysUnder(queryKey: string[]): string[] {
  const prefix = queryKey.join('\0');
  return [...useFeedDataStore.getState().feedData.keys()].filter((key) =>
    isUnderQueryKey(key, prefix),
  );
}

export function injectPostIntoFeedCache(
  queryKey: string[],
  newBundle: v2.EventBundle,
): void {
  const post = decodePostBundle(newBundle);
  if (!post) return;
  for (const key of cachedKeysUnder(queryKey)) {
    useFeedDataStore.getState().injectPostToFront(key, post);
  }
}

/**
 * Optimistically insert a post as its parent's first reply in a thread
 */
export function injectReplyIntoThreadCache(
  newBundle: v2.EventBundle,
  limit = 0,
): void {
  const post = decodePostBundle(newBundle);
  const parentId = post?.reply?.parentId;
  if (!post) return;
  if (!parentId) return;

  const key = threadQueryKey(parentId, limit).join('\0');
  useFeedDataStore.getState().injectPostReply(key, post);
}

/**
 * Locally change the reply count of the post corresponding to `parentPostId`
 * by `amount` until the server catches up.
 */
export function alterPostReplyCount(
  queryKey: string[],
  parentPostId: string,
  amount: number,
): void {
  for (const key of cachedKeysUnder(queryKey)) {
    useFeedDataStore.getState().alterReplyCount(key, parentPostId, amount);
  }
}

/**
 * Optimistically overlay the current identity's reaction change onto
 * `post` in the given query.
 * Any previous reaction should be given as `prev` and the new reaction
 * should be `next`.
 * `overlayTallies` should only be true on queries where the server responds
 * with tallies.
 */
export function injectReactionIntoFeedCache(
  queryKey: string[],
  postId: string,
  prev: Reaction | undefined,
  next: Reaction | undefined,
  overlayTallies: boolean,
): void {
  for (const key of cachedKeysUnder(queryKey)) {
    useFeedDataStore
      .getState()
      .injectReaction(key, postId, prev, next, overlayTallies);
  }
}
