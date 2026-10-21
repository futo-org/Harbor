import { requireNativeView } from 'expo';
import type { ViewProps } from 'react-native';

type EmojiSpriteProps = ViewProps & {
  /** Sprite page in the module's assets, from tools/twemoji/generate.mjs. */
  page: number;
  /** Row-major cell within the page. */
  cell: number;
  /** Cells per page row. */
  pageColumns: number;
};

/** Android only: one emoji drawn from a shared Twemoji sprite page. */
export const EmojiSprite = requireNativeView<EmojiSpriteProps>('EmojiSprite');
