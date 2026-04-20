import { EMPTY_FEED, type FeedHookResult } from './types';

export function useFollowingFeed(_options?: {
  limit?: number;
  enabled?: boolean;
}): FeedHookResult {
  return EMPTY_FEED;
}
