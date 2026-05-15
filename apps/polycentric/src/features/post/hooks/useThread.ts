import { useMemo, useState } from 'react';
import {
  COLLECTION,
  Query,
  v2,
  type EventKey,
} from '@polycentric/react-native';
import {
  decodeV2PostBundle,
  useLocalPostInjection,
  type PostData,
} from '@/src/common/lib/polycentric-hooks';
import { useQuery } from '@/src/common/query/hooks/useQuery';

const DUMMY_EVENT_KEY: EventKey = {
  collection: COLLECTION.FEED,
  identity: '',
  signedBy: { keyType: 0, key: new ArrayBuffer(0) },
  sequence: 0n,
};

/**
 * Load the thread for a given post via the server's `GetPostThread` RPC.
 * The server returns a flat ordered list — ancestors (root → direct parent),
 * the subject post itself, then descendants (newest first).
 *
 * Locally-authored replies are injected as the first descendant (right
 * after the subject) before the server round-trip.
 */
export function useThread(
  post: PostData | undefined,
  options?: { limit?: number },
): { thread: PostData[]; isLoading: boolean; error: Error | null } {
  const eventKey: EventKey = useMemo(() => {
    if (!post) return DUMMY_EVENT_KEY;
    // `post.signedBy.key` is a Uint8Array view into the wire-decoded
    // message buffer (protobuf-ts uses subarray). `.buffer` would be
    // the whole message buffer, not just the key bytes — copy through
    // `.slice()` so the FFI receives exactly the public-key bytes.
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
    ['post_thread', post?.id ?? '', String(limit)],
    new Query.GetPostThread({ eventKey, limit }),
    undefined,
    !!post,
  );

  const serverThread = useMemo(() => {
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

  const [localReplies, setLocalReplies] = useState<PostData[]>([]);
  useLocalPostInjection({
    enabled: !!post,
    match: (p) => !!post && p.reply?.parentId === post.id,
    insert: (decoded) =>
      setLocalReplies((prev) =>
        prev.some((r) => r.id === decoded.id) ? prev : [decoded, ...prev],
      ),
  });

  const thread = useMemo(() => {
    if (!post || localReplies.length === 0) return serverThread;
    const known = new Set(serverThread.map((p) => p.id));
    const additions = localReplies.filter((p) => !known.has(p.id));
    if (additions.length === 0) return serverThread;
    const idx = serverThread.findIndex((r) => r.id === post.id);
    if (idx < 0) return [...serverThread, ...additions];
    return [
      ...serverThread.slice(0, idx + 1),
      ...additions,
      ...serverThread.slice(idx + 1),
    ];
  }, [post, serverThread, localReplies]);

  return {
    thread,
    isLoading: query.isLoading,
    error: query.error ? new Error(query.error) : null,
  };
}
