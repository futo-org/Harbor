# emoji-sprite

Android-only native view that draws an emoji from a shared sprite page.

## Why

Rendering each twemoji cell as its own image is very slow (because each image
needs to be decoded separately), especially on Android (especially on weaker
devices). iOS doesn't seem to have this issue (or at least not to the same
extent). Web already relies on a single sprite image. Android uses multiple
sprites to use the memory more efficiently. Only meant to be used in the picker,
elsewhere in the app emojis are still rendered independently.

## How it works

- `tools/twemoji/generate.mjs` writes the pages to
  `android/src/main/assets/emoji-sprite/page-N.png` (16 columns of 72px cells, a
  new page at each category) and the page layout (`SPRITE_PAGE_STARTS`,
  `SPRITE_PAGE_COLUMNS`) to `src/common/emoji/twemoji/sheet.ts`.
- `EmojiGridImage.android.tsx` maps an emoji to a `page` and `cell` and renders
  `EmojiSprite`. Emoji missing from the pages, such as skin tones, fall back to
  `EmojiImage`.
- `EmojiSpritePages.kt` decodes pages off the main thread, at half size on
  low-RAM devices, into an LRU cache that is cleared when the app is
  backgrounded.
- `EmojiSpriteView.kt` draws its cell from the cached page. A recycled view
  keeps showing its previous emoji until the new page decodes (matching default
  ExpoImage behavior and preventing flickering when switching between
  categories).
