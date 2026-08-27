import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { Atoms, ZIndex } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
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
  const open = images.length > 0;

  // Guard against double-dismiss: simultaneous pinch + pan can both fire
  // close, and `router.canGoBack()` may still read true before the first
  // back() settles — popping an extra screen (notably on Android).
  const closing = useRef(false);
  const onClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (router.canGoBack()) router.back();
  }, []);

  useBodyScrollLock(isWeb && open);

  // Images only exist in memory, so just send the user home (happens if page
  // is refreshed while on /image-viewer route)
  if (isWeb && !open) return <Redirect href="/" />;

  const viewer = (
    <ImageViewer images={images} initialIndex={index} onClose={onClose} />
  );

  return isWeb ? (
    <View style={[Atoms.fixed, Atoms.inset_0, { zIndex: ZIndex.modal }]}>
      {viewer}
    </View>
  ) : (
    viewer
  );
}

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;

    const body = document.body;
    const y = window.scrollY;

    body.style.position = 'fixed';
    body.style.top = `-${y}px`;
    body.style.left = '0';
    body.style.right = '0';

    return () => {
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';

      window.scrollTo(0, y);
    };
  }, [locked]);
}
