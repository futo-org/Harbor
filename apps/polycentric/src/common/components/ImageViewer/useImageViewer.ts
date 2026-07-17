import { router } from 'expo-router';
import { useCallback } from 'react';
import {
  useImageViewerStore,
  type ImageViewerInput,
} from './useImageViewerStore';

/**
 * Opens the full-screen image viewer from anywhere in the app: stashes
 * the images in {@link useImageViewerStore} and pushes the
 * `image-viewer` route that reads them back out.
 */
export function useImageViewer() {
  const show = useImageViewerStore((s) => s.show);
  return useCallback(
    (images: ImageViewerInput[], index = 0) => {
      if (images.length === 0) return;
      show(images, index);
      router.push('/image-viewer');
    },
    [show],
  );
}
