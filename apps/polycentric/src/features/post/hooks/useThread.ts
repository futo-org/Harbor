import { useMemo } from 'react';
import {
  COLLECTION,
  Query,
  v2,
  type EventKey,
} from '@polycentric/react-native';
import {
  bundleEventId,
  decodeV2PostBundle,
  type PostData,
} from '@/src/common/lib/polycentric-hooks';
import {
  getQueryCache,
  setQueryCache,
  useQuery,
} from '@/src/common/query/hooks/useQuery';

const DUMMY_EVENT_KEY: EventKey = {
  collection: COLLECTION.FEED,
  identity: '',
  signedBy: { keyType: 0, key: new ArrayBuffer(0) },
  sequence: 0n,
};

export function threadQueryKey(parentId: string, limit = 0): string[] {
  return ['post_thread', parentId, String(limit)];
}

/**
 * Load the thread for a given post
 */
export function useThread(
  post: PostData | undefined,
  options?: { limit?: number },
): { thread: PostData[]; isLoading: boolean; error: Error | null } {
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

  const query = useQuery(
    threadQueryKey(post?.id ?? '', limit),
    new Query.GetPostThread({ eventKey, limit }),
    undefined,
    !!post,
  );

  const thread = useMemo(() => {
    if (!query.data) return [];
    const response = v2.GetPostThreadResponse.fromBinary(
      new Uint8Array(query.data),
    );
    const decoded: PostData[] = [];
    for (const bundle of response.thread) {
      const d = decodeV2PostBundle(bundle);
      if (d) decoded.push(d);
    }
    return decoded;
  }, [query.data]);

  return {
    thread,
    isLoading: query.isLoading,
    error: query.error ? new Error(query.error) : null,
  };
}

/**
 * Optimistically add a reply to the top of the threas
 */
export function injectReplyIntoThreadCache(
  parentId: string,
  newBundle: v2.EventBundle,
  limit = 0,
): void {
  const key = threadQueryKey(parentId, limit);
  const cached = getQueryCache(key);
  if (!cached?.data) return;

  const newId = bundleEventId(newBundle);
  if (!newId) return;

  let response: v2.GetPostThreadResponse;
  try {
    response = v2.GetPostThreadResponse.fromBinary(new Uint8Array(cached.data));
  } catch {
    return;
  }

  for (const b of response.thread) {
    if (bundleEventId(b) === newId) return;
  }

  const subjectIdx = response.thread.findIndex(
    (b) => bundleEventId(b) === parentId,
  );
  const insertAt = subjectIdx >= 0 ? subjectIdx + 1 : response.thread.length;

  const newThread = [...response.thread];
  newThread.splice(insertAt, 0, newBundle);

  const updated = v2.GetPostThreadResponse.create({ thread: newThread });
  const bytes = v2.GetPostThreadResponse.toBinary(updated);
  // `.slice().buffer` gives a clean ArrayBuffer that matches `bytes.byteLength`
  // — `bytes.buffer` could be larger than the view.
  setQueryCache(key, { data: bytes.slice().buffer });
}
