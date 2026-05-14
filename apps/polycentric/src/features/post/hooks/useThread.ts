import { useCallback, useEffect, useRef, useState } from 'react';
import {
  COLLECTION,
  Query,
  QueryStatus,
  v2,
  type EventKey,
} from '@polycentric/react-native';
import {
  decodeV2PostBundle,
  useLocalPostInjection,
  usePolycentricContext,
  type PostData,
} from '@/src/common/lib/polycentric-hooks';

type Sub = { unsubscribe: () => void };

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
  const { client } = usePolycentricContext();
  const [thread, setThread] = useState<PostData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Hold the live subscription so we can cancel on unmount / refresh /
  // post change. The rust core fans out to every configured server
  // and pushes one `next` per server, then a single `complete`.
  const subscriptionRef = useRef<Sub | null>(null);

  const cleanup = useCallback(() => {
    subscriptionRef.current?.unsubscribe();
    subscriptionRef.current = null;
  }, []);

  useEffect(() => {
    cleanup();
    if (!post) {
      setThread([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setThread([]);
    setError(null);
    setIsLoading(true);

    // `post.signedBy.key` is a Uint8Array view into the wire-decoded
    // message buffer (protobuf-ts uses subarray). `.buffer` would be
    // the whole message buffer, not just the key bytes — copy through
    // `.slice()` so the FFI receives exactly the public-key bytes.
    const keyBytes = post.signedBy.key.slice().buffer as ArrayBuffer;
    const eventKey: EventKey = {
      collection: COLLECTION.FEED,
      identity: post.identity,
      signedBy: {
        keyType: post.signedBy.keyType,
        key: keyBytes,
      },
      sequence: BigInt(post.sequence),
    };

    const observable = client.core.fetchQuery(
      ['post_thread', post.id, String(options?.limit ?? 0)],
      new Query.GetPostThread({
        eventKey,
        limit: options?.limit ?? 0,
      }),
      undefined,
    );

    subscriptionRef.current = observable.subscribe({
      next: (result) => {
        if (result.data) {
          const response = v2.GetPostThreadResponse.fromBinary(
            new Uint8Array(result.data),
          );
          const decoded: PostData[] = [];
          for (const bundle of response.thread) {
            const d = decodeV2PostBundle(bundle);
            if (d) decoded.push(d);
          }
          setThread(decoded);
        }
        setIsLoading(result.status === QueryStatus.Loading);
      },
      error: (message: string) => {
        setError(new Error(message));
        setIsLoading(false);
      },
      complete: () => {
        setIsLoading(false);
      },
    });

    return cleanup;
  }, [client, post, options?.limit, cleanup]);

  useLocalPostInjection({
    enabled: !!post,
    match: (p) => !!post && p.reply?.parentId === post.id,
    insert: (decoded) =>
      setThread((prev) => {
        // Either no post or we already have it
        if (!post || prev.some((r) => r.id === decoded.id)) return prev;
        // Add the new reply at the top of the list
        const idx = prev.findIndex((r) => r.id === post.id);
        if (idx < 0) return [...prev, decoded];
        return [...prev.slice(0, idx + 1), decoded, ...prev.slice(idx + 1)];
      }),
  });

  return { thread, isLoading, error };
}
