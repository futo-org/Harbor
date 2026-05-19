import { v2 } from '@polycentric/react-native';
import { bundleEventId } from '@/src/common/lib/polycentric-hooks';
import {
  getQueryCache,
  setQueryCache,
} from '@/src/common/query/hooks/useQuery';

export const feedQueryKeys = {
  following: (): string[] => ['following_feed'],
  identity: (identity: string): string[] => ['identity_feed', identity],
  explore: (identity: string): string[] => ['explore_feed', identity],
};

/**
 * Optimistically prepend a post into a feed
 */
export function injectPostIntoFeedCache(
  queryKey: string[],
  newBundle: v2.EventBundle,
): void {
  const cached = getQueryCache(queryKey);
  if (!cached?.data) return;

  const newId = bundleEventId(newBundle);
  if (!newId) return;

  let response: v2.GetFeedResponse;
  try {
    response = v2.GetFeedResponse.fromBinary(new Uint8Array(cached.data));
  } catch {
    return;
  }

  for (const b of response.eventBundles) {
    if (bundleEventId(b) === newId) return;
  }

  const updated = v2.GetFeedResponse.create({
    eventBundles: [newBundle, ...response.eventBundles],
  });
  const bytes = v2.GetFeedResponse.toBinary(updated);
  setQueryCache(queryKey, { data: bytes.slice().buffer });
}
