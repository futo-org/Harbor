import { useEffect, useState } from 'react';
import { COLLECTION, v2 } from '@polycentric/react-native';
import {
  decodeV2PostBundle,
  usePolycentricContext,
  type PostData,
} from '@/src/common/lib/polycentric-hooks';

/**
 * Load the direct replies for a given post via the server's `GetPostThread`
 * RPC. The server returns the parent post plus the replies — we only surface
 * the replies here because the caller already has the parent.
 */
export function useThreadReplies(
  post: PostData | undefined,
  options?: { limit?: number },
): { replies: PostData[]; isLoading: boolean; error: Error | null } {
  const { client } = usePolycentricContext();
  const [replies, setReplies] = useState<PostData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!post) {
      setReplies([]);
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
        for (const bundle of response?.replies ?? []) {
          const d = decodeV2PostBundle(bundle);
          if (d) decoded.push(d);
        }
        setReplies(decoded);
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

  return { replies, isLoading, error };
}
