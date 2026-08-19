// The fonts live in `public/` so the web build also serves them statically
// for `+html.tsx`'s @font-face rules.
export const Fonts = {
  NotoSans: require('../../../public/fonts/NotoSans.ttf'),
  'NotoSans-Italic': require('../../../public/fonts/NotoSans-Italic.ttf'),
} as const;
