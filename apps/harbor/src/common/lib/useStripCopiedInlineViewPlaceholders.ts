import * as Clipboard from 'expo-clipboard';
import { useEffect } from 'react';
import { isAndroid } from '@/src/common/util/platform';

// U+FFFC OBJECT REPLACEMENT CHARACTER: what Android copies for each inline
// view (Twemoji image) in a text selection. `CopyOnlyText` next
// to the view already carries its text.
const INLINE_VIEW_PLACEHOLDER = '\uFFFC';

/**
 * Removes inline view placeholders from text copied on Android. iOS leaves
 * them out of copied text on its own, and web has no inline views.
 */
export function useStripCopiedInlineViewPlaceholders() {
  useEffect(() => {
    if (!isAndroid) return;
    const subscription = Clipboard.addClipboardListener(async () => {
      const copied = await Clipboard.getStringAsync();
      // Our own rewrite fires this listener again and stops here.
      if (!copied.includes(INLINE_VIEW_PLACEHOLDER)) return;
      await Clipboard.setStringAsync(
        copied.replaceAll(INLINE_VIEW_PLACEHOLDER, ''),
      );
    });
    return () => subscription.remove();
  }, []);
}
