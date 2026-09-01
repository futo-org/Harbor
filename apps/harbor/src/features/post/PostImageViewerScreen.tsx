import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ImageViewerScreen } from '@/src/common/components/ImageViewer';
import { Routes } from '@/src/common/constants/routes';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { getKeyFingerprint } from '@/src/common/lib/polycentric-hooks/helpers';
import { openWithReturn } from '@/src/common/lib/navigation/openWithReturn';
import { MAX_ATTACHMENTS } from '@/src/features/composer/hooks/useComposer';
import { usePostById } from './hooks/usePostById';

/**
 * Full-screen viewer for one post's images, mounted by the
 * `/[identityId]/post/[keyFingerprint]/[sequence]/image/[index]` route as
 * a transparentModal over whatever screen pushed it (feed, profile, ...).
 * Loads the post from the URL params, so a refresh or shared link shows
 * the same image; arrows update the `index` param in place.
 */
export default function PostImageViewerScreen() {
  const {
    identityId,
    keyFingerprint,
    sequence = '',
    index,
  } = useLocalSearchParams<{
    identityId: string;
    keyFingerprint: string;
    sequence: string;
    index: string;
  }>();

  const { post, isLoading } = usePostById(
    identityId,
    keyFingerprint,
    BigInt(sequence),
  );

  const postRoute = Routes.tabs.post(identityId, keyFingerprint, sequence);

  const onIndexChange = useCallback((i: number) => {
    router.setParams({ index: String(i + 1) });
  }, []);

  // Cap to what the grid displays, so the URL can't reach an image the
  // page doesn't show (posts from other clients may carry more).
  const images = post?.images.slice(0, MAX_ATTACHMENTS) ?? [];

  // Loaded but nothing to show (deleted post, no attachments, bad index
  // source): the post page is the sensible place to land.
  if (!isLoading && images.length === 0) return <Redirect href={postRoute} />;

  const initialIndex = parseImageIndex(index, images.length);

  return (
    <ImageViewerScreen
      images={images}
      initialIndex={initialIndex}
      fallbackHref={postRoute}
      onIndexChange={onIndexChange}
    />
  );
}

/**
 * Parse the 1-based `index` URL param into a 0-based array index,
 * clamping junk (and out-of-range values) to the nearest valid image.
 */
export function parseImageIndex(param: string, count: number): number {
  const parsed = Number.parseInt(param, 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.min(Math.max(parsed - 1, 0), Math.max(count - 1, 0));
}

/** Open the viewer for a post's images; `index` is the 0-based tap index. */
export function openPostImage(post: PostData, index: number) {
  const keyFingerprint = getKeyFingerprint(post.signedBy);
  if (!keyFingerprint) return;
  // URLs count images from 1.
  openWithReturn(
    Routes.tabs.postImage(
      post.identity,
      keyFingerprint,
      post.sequence,
      index + 1,
    ),
  );
}
