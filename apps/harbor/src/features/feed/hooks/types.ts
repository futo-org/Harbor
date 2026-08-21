import type { PostData } from '@/src/common/lib/polycentric-hooks';

export interface FeedHookResult {
  items: PostData[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  refresh: () => void;
  /** Identifies the feed, e.g. for scroll restoration. */
  queryKey?: string[];
}

export const EMPTY_POSTS: PostData[] = [];
export const NOOP = async () => {};
export const NOOP_SYNC = () => {};

export const EMPTY_FEED: FeedHookResult = {
  items: EMPTY_POSTS,
  isLoading: false,
  isRefreshing: false,
  error: null,
  loadMore: NOOP,
  hasMore: false,
  refresh: NOOP_SYNC,
};
