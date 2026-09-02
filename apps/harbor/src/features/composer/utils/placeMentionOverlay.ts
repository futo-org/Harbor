import { Spacing } from '@/src/common/theme';

import type { MentionAnchor } from '@/src/features/composer/utils/measureWebMentionAnchor';

export const MENTION_OVERLAY_WIDTH = 320;
const MARGIN = Spacing.md;

/**
 * Fixed-position box for the web mention overlay: top-left corner under the
 * `@` when it sits in the upper half of the window, bottom-left corner above
 * it otherwise. Clamped to the window; `maxHeight` is whatever room is left.
 */
export function placeMentionOverlay(
  anchor: MentionAnchor,
  win: { width: number; height: number },
) {
  const width = Math.min(MENTION_OVERLAY_WIDTH, win.width - 2 * MARGIN);
  const left = Math.max(MARGIN, Math.min(anchor.x, win.width - width - MARGIN));
  return anchor.bottom <= win.height / 2
    ? {
        left,
        width,
        top: anchor.bottom + Spacing.sm,
        maxHeight: win.height - anchor.bottom - MARGIN,
      }
    : {
        left,
        width,
        bottom: win.height - anchor.top + Spacing.sm,
        maxHeight: anchor.top - MARGIN,
      };
}
