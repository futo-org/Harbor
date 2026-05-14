import { useCallback, useEffect, useRef, useState } from 'react';
import { COLLECTION, Query, QueryStatus, v2 } from '@polycentric/react-native';
import {
  decodeV2PostBundle,
  usePolycentricContext,
  type PostData,
} from '@/src/common/lib/polycentric-hooks';
import { getKeyFingerprint } from '@/src/common/lib/polycentric-hooks/helpers';

type Sub = { unsubscribe: () => void };

/**
 * Load a single post by its (identity, sequence) route params.
 *
 * Subscribes to `core.getEvent`, which checks the local store first
 * and falls back to a `ListEvents` query with `sequenceGt = seq - 1`
 * / `sequenceLt = seq + 1` to pin the network query to exactly one
 * sequence. `keyFingerprint` is used only to verify the returned
 * bundle matches the expected signer; the rust side picks the first
 * local-store hit at that sequence.
 */
export function usePostById(
  identityId: string | undefined,
  keyFingerprint: string | undefined,
  sequence: bigint | undefined,
): { post: PostData | null; isLoading: boolean; error: Error | null } {
  const { client } = usePolycentricContext();
  const [post, setPost] = useState<PostData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Hold the live subscription so we can cancel on unmount / param change.
  const subscriptionRef = useRef<Sub | null>(null);
  const cleanup = useCallback(() => {
    subscriptionRef.current?.unsubscribe();
    subscriptionRef.current = null;
  }, []);

  useEffect(() => {
    cleanup();
    if (!identityId || sequence == null || !keyFingerprint) {
      setPost(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setPost(null);
    setError(null);
    setIsLoading(true);

    const observable = client.core.fetchQuery(
      ['event', String(COLLECTION.FEED), identityId, sequence.toString()],
      new Query.GetEvent({
        identity: identityId,
        collection: COLLECTION.FEED,
        sequence,
      }),
      undefined,
    );

    subscriptionRef.current = observable.subscribe({
      next: (result) => {
        if (result.data && result.data.byteLength > 0) {
          try {
            const bundle = v2.EventBundle.fromBinary(
              new Uint8Array(result.data),
            );
            // Verify the signer fingerprint matches the URL so a
            // sequence collision across signers doesn't render the
            // wrong post.
            if (bundle.signedEvent) {
              const ev = v2.Event.fromBinary(bundle.signedEvent.eventBytes);
              if (
                getKeyFingerprint(ev.key?.signedBy) === keyFingerprint &&
                ev.key?.sequence === sequence
              ) {
                setPost(decodeV2PostBundle(bundle));
              } else if (result.status === QueryStatus.Success) {
                setPost(null);
              }
            } else if (result.status === QueryStatus.Success) {
              setPost(null);
            }
          } catch {
            // Ignore malformed bundle, wait for next emission or completion.
          }
        } else if (result.status === QueryStatus.Success) {
          setPost(null);
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
  }, [client, identityId, keyFingerprint, sequence, cleanup]);

  return { post, isLoading, error };
}
