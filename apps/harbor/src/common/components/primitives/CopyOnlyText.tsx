import { UITextView } from '@bsky.app/react-native-uitextview';

/**
 * Invisible, near-zero-width real text placed next to an inline view (a
 * Twemoji image, a mention box), so copying a text selection includes the
 * characters the view shows. Inline views themselves copy as nothing (iOS,
 * web) or as U+FFFC (Android, see `useStripCopiedInlineViewPlaceholders`).
 */
export function CopyOnlyText({ children }: { children: string }) {
  return (
    // UITextView rather than our Text, so it inherits the parent's line height
    // instead of setting its own.
    <UITextView style={{ color: 'transparent', fontSize: 0.01 }}>
      {children}
    </UITextView>
  );
}
