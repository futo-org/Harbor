import { useEffect, useState } from 'react';
import { COLLECTION, v2 } from '@polycentric/react-native';
import {
  decodeV2PostBundle,
  useLocalPostInjection,
  usePolycentricContext,
  type PostData,
} from '@/src/common/lib/polycentric-hooks';

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

  useEffect(() => {
    if (!post) {
      setThread([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const response = await client.getPostThread({
          eventKey: v2.EventKey.create({
            collection: COLLECTION.FEED,
            identity: post.identity,
            signedBy: post.signedBy,
            sequence: BigInt(post.sequence),
          }),
          limit: options?.limit ?? null,
        });
        if (cancelled) return;

        const decoded: PostData[] = [];
        for (const bundle of response?.thread ?? []) {
          const d = decodeV2PostBundle(bundle);
          if (d) decoded.push(d);
        }
        setThread(decoded);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, post, options?.limit]);

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
