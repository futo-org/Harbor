import { router } from 'expo-router';
import { useCallback } from 'react';
import { ImageViewer } from './ImageViewer';
import { useImageViewerStore } from './useImageViewerStore';

/**
 * Full-screen image viewer screen, mounted by the `image-viewer` route.
 * That route is declared with `orientation: 'all'` in the root layout, so
 * this screen can rotate to landscape independently of the otherwise-
 * portrait app. Reads its images from {@link useImageViewerStore}.
 */
export default function ImageViewerScreen() {
  const images = useImageViewerStore((s) => s.images);
  const index = useImageViewerStore((s) => s.index);

  const onClose = useCallback(() => {
    if (router.canGoBack()) router.back();
  }, []);

  if (images.length === 0) return null;
  return <ImageViewer images={images} initialIndex={index} onClose={onClose} />;
}
