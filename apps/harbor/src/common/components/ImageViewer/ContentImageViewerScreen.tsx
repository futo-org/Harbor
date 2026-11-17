import type { v2 } from '@polycentric/react-native';
import { type Href, Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { MAX_ATTACHMENTS } from '@/src/common/lib/images/useImageAttachments';
import { ImageViewerScreen } from './ImageViewerScreen';
import { parseImageIndex } from './parseImageIndex';

/**
 * Viewer for the images attached to a piece of content (post, claim), for
 * routes ending in `image/[index]`. The 1-based `index` param picks the
 * image, and arrows update it in place.
 */
export function ContentImageViewerScreen({
  images = [],
  isLoading,
  fallbackHref,
}: {
  images?: v2.ImageSet[];
  isLoading: boolean;
  /** The content's own page: where close lands on a cold load, and where
   *  loaded content without images redirects. */
  fallbackHref: Href;
}) {
  const { index = '' } = useLocalSearchParams<{ index: string }>();

  const onIndexChange = useCallback((i: number) => {
    router.setParams({ index: String(i + 1) });
  }, []);

  // Cap to what the grid displays, so the URL can't reach an image the
  // page doesn't show (content from other clients may carry more).
  const capped = images.slice(0, MAX_ATTACHMENTS);

  // Loaded but nothing to show (deleted content, no attachments)
  if (!isLoading && capped.length === 0)
    return <Redirect href={fallbackHref} />;

  return (
    <ImageViewerScreen
      images={capped}
      initialIndex={parseImageIndex(index, capped.length)}
      fallbackHref={fallbackHref}
      onIndexChange={onIndexChange}
    />
  );
}
