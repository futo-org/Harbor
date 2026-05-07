import { useEffect, useState } from 'react';
import { COLLECTION, v2 } from '@polycentric/react-native';
import {
  bytesToHex,
  decodeV2PostBundle,
  hexToBytes,
  usePolycentricContext,
  type PostData,
} from '@/src/common/lib/polycentric-hooks';
import { getKeyFingerprint } from '@/src/common/lib/polycentric-hooks/helpers';

/**
 * Load a single post by its (identity, sequence) route params.
 *
 * Uses `listEvents` with `sequenceGt = seq - 1` / `sequenceLt = seq + 1` to
 * pin the query to exactly one sequence number server-side. No local cache —
 * the detail screen re-queries when it mounts.
 */
export function usePostById(
  identityId: string | undefined,
  keyFingerprint: string | undefined,
  sequence: BigInt | undefined,
): { post: PostData | null; isLoading: boolean; error: Error | null } {
  const { client } = usePolycentricContext();
  const [post, setPost] = useState<PostData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!keyFingerprint || !identityId || !sequence) {
      setPost(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const bundles = await client.listEvents({
          identity: identityId,
          collection: COLLECTION.FEED,
          sequenceGt: Number(sequence) - 1,
          sequenceLt: Number(sequence) + 1,
        });
        if (cancelled) return;

        const match = bundles.find((b) => {
          if (!b.signedEvent) return false;
          try {
            const ev = v2.Event.fromBinary(b.signedEvent.eventBytes);
            if (!ev.vectorClock) return false;
            return (
              getKeyFingerprint(ev.key?.signedBy) === keyFingerprint &&
              ev.key?.sequence === sequence
            );
          } catch {
            return false;
          }
        });

        setPost(match ? decodeV2PostBundle(match) : null);
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
  }, [client, identityId, keyFingerprint, sequence]);

  return { post, isLoading, error };
}
