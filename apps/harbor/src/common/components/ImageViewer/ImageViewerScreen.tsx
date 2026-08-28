import { router, type Href } from 'expo-router';
import { useCallback, useRef } from 'react';
import { View } from 'react-native';
import { useCanReturn } from '@/src/common/lib/navigation/openWithReturn';
import { Atoms, ZIndex } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { ImageViewer } from './ImageViewer';
import type { ImageViewerInput } from './resolveImageSources';
import { RemoveScroll } from 'react-remove-scroll';

/**
 * Shared shell for the image-viewer routes (post images, profile photo):
 * a transparentModal screen body that locks document scroll, renders the
 * viewer in a fixed full-viewport wrapper on web, and closes with
 * back-or-fallback semantics. Pass `images: []` while the route's data is
 * still loading — the viewer renders just its backdrop until they arrive.
 */
export function ImageViewerScreen({
  images,
  initialIndex = 0,
  fallbackHref,
  onIndexChange,
}: {
  images: ImageViewerInput[];
  initialIndex?: number;
  /** Where close lands when the route was cold-loaded (refresh, shared
   *  link) instead of pushed by an in-app tap. */
  fallbackHref: Href;
  onIndexChange?: (index: number) => void;
}) {
  const canReturn = useCanReturn();

  // Guard against double-dismiss: simultaneous pinch + pan can both fire
  // close, and `router.canGoBack()` may still read true before the first
  // back() settles — popping an extra screen (notably on Android).
  const closing = useRef(false);
  const onClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    // Opened in-session: return to wherever the user was. Cold load:
    // land on the content the image belongs to.
    if (canReturn && router.canGoBack()) router.back();
    else router.replace(fallbackHref);
  }, [canReturn, fallbackHref]);

  const content = (
    <ImageViewer
      images={images}
      initialIndex={initialIndex}
      onClose={onClose}
      onIndexChange={onIndexChange}
    />
  );

  return isWeb ? (
    // RemoveScroll matches the scroll lock behavior of @rn-primitives/dropdown-menu
    <RemoveScroll>
      <View style={[Atoms.fixed, Atoms.inset_0, { zIndex: ZIndex.modal }]}>
        {content}
      </View>
    </RemoveScroll>
  ) : (
    content
  );
}
