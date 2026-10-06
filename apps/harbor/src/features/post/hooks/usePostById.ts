import { useMemo } from 'react';
import {
  COLLECTION,
  type FetchMode,
  Query,
  v2,
  labelsFromGetPostResponse,
} from '@polycentric/react-native';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import {
  decodeFeedItems,
  labelMapFromSets,
} from '@/src/common/lib/polycentric-hooks/helpers';
import { useQuery } from '@/src/common/query/hooks/useQuery';

/**
 * Load a single post by its (identity, sequence) route params.
 */
export function usePostById(
  identityId: string | undefined,
  keyFingerprint: string | undefined,
  sequence: bigint | undefined,
  options?: { fetchMode?: FetchMode },
): { post: PostData | null; isLoading: boolean; error: Error | null } {
  const enabled = !!identityId && sequence != null && !!keyFingerprint;

  const query = useQuery(
    [
      'event',
      String(COLLECTION.FEED),
      identityId ?? '',
      keyFingerprint ?? '',
      sequence?.toString() ?? '',
    ],
    new Query.GetPost({
      identity: identityId ?? '',
      sequence: sequence ?? 0n,
      signerKeyPrefix: keyFingerprint,
    }),
    options?.fetchMode ? { fetchMode: options.fetchMode } : undefined,
    enabled,
  );

  const post = useMemo<PostData | null>(() => {
    if (!enabled) return null;
    if (!query.data || query.data.byteLength === 0) return null;

    try {
      const response = v2.GetPostResponse.fromBinary(
        new Uint8Array(query.data),
      );

      // TODO: change feed decoding API to make this step unnecessary
      const feedShaped = v2.GetFeedResponse.create({
        eventBundles: response.candidates,
        eventHints: response.eventHints,
      });

      const labelMap = labelMapFromSets(labelsFromGetPostResponse(query.data));
      const items = decodeFeedItems(feedShaped, labelMap);

      // TODO: should we reject reposts here?
      const postData = items.at(0);
      if (!postData) return null;

      return postData;
    } catch {
      return null;
    }
  }, [enabled, query.data]);

  return {
    post,
    isLoading: query.isLoading,
    error: query.error ? new Error(query.error) : null,
  };
}
