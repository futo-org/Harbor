import { useMemo } from 'react';
import { COLLECTION, Query, type EventKey } from '@polycentric/react-native';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { useOmitLabels } from '@/src/common/settings/useOmitLabels';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import { type FeedHookResult, NOOP } from '../../feed/hooks/types';
import {
  threadQueryKey,
  useThreadWithOverlays,
} from '@/src/features/feed/hooks/feedCache';

const DUMMY_EVENT_KEY: EventKey = {
  collection: COLLECTION.FEED,
  identity: '',
  signedBy: { keyType: 0, key: new ArrayBuffer(0) },
  sequence: 0n,
};

/**
 * Load the thread for a given post
 */
export function useThread(
  post: PostData | undefined,
  options?: { limit?: number },
): FeedHookResult {
  const eventKey: EventKey = useMemo(() => {
    if (!post) return DUMMY_EVENT_KEY;

    return {
      collection: COLLECTION.FEED,
      identity: post.identity,
      signedBy: {
        keyType: post.signedBy.keyType,
        key: post.signedBy.key.slice().buffer as ArrayBuffer,
      },
      sequence: BigInt(post.sequence),
    };
  }, [post]);

  const limit = options?.limit ?? 0;
  const omitLabels = useOmitLabels();

  const queryKey = threadQueryKey(post?.id ?? '', limit);

  const query = useQuery(
    queryKey,
    new Query.GetPostThread({ eventKey, limit, omitLabels }),
    undefined,
    !!post,
  );

  const items = useThreadWithOverlays(queryKey, query.data);

  return {
    items,
    isLoading: query.isLoading,
    isRefreshing: query.hasPendingRefresh,
    error: query.error ? new Error(query.error) : null,
    refresh: () => query.refresh(RefreshStrategy.Lazy),
    // TODO: paginate threads
    loadMore: NOOP,
    hasMore: false,
  };
}
