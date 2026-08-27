import { router } from 'expo-router';
import { useCallback } from 'react';
import { isWeb } from '@/src/common/util/platform';
import {
  useImageViewerStore,
  type ImageViewerInput,
} from './useImageViewerStore';

/**
 * Opens the full-screen image viewer from anywhere in the app: stashes
 * the images in {@link useImageViewerStore} and, on native, pushes the
 * `image-viewer` route that reads them back out. On web there is no
 * route — {@link ImageViewerHost} overlays the viewer while the store
 * is non-empty, so the URL never changes and a refresh just lands back
 * on the underlying page.
 */
export function useImageViewer() {
  const show = useImageViewerStore((s) => s.show);
  return useCallback(
    (images: ImageViewerInput[], index = 0) => {
      if (images.length === 0) return;
      show(images, index);
      if (!isWeb) router.push('/image-viewer');
    },
    [show],
  );
}
