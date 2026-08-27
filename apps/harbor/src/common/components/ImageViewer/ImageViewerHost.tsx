import { View } from 'react-native';
import { Atoms, ZIndex } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { ImageViewer } from './ImageViewer';
import { useImageViewerStore } from './useImageViewerStore';
import { useEffect } from 'react';

/**
 * Web-only overlay host for the image viewer, mounted once in the root
 * layout. Web scrolls the document, so a route-based transparent modal
 * would sit in document flow and scroll away with the page; instead the
 * viewer renders here in a `position: fixed` wrapper whenever the store
 * has images, and the URL never changes. Native keeps the
 * `image-viewer` route (needed for its `orientation: 'all'`).
 */
export function ImageViewerHost() {
  const images = useImageViewerStore((s) => s.images);
  const index = useImageViewerStore((s) => s.index);
  const hide = useImageViewerStore((s) => s.hide);
  const open = isWeb && images.length > 0;

  useBodyScrollLock(open);

  if (!open) return null;

  return (
    <View style={[Atoms.fixed, Atoms.inset_0, { zIndex: ZIndex.modal }]}>
      <ImageViewer images={images} initialIndex={index} onClose={hide} />
    </View>
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
