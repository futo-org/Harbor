import { EMPTY_FEED, type FeedHookResult } from './types';

export function useLikesFeed(_options?: {
  limit?: number;
  enabled?: boolean;
  getIsAborted?: () => boolean;
}): FeedHookResult {
  return EMPTY_FEED;
}
