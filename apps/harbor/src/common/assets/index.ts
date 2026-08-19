// Static per-weight instances of the variable fonts in `public/fonts/`
// (which web's `+html.tsx` uses): native font APIs can't select variable
// weights, so each face is registered as its own family.
export const Fonts = {
  'NotoSans-Regular': require('./fonts/NotoSans-Regular.ttf'),
  'NotoSans-Medium': require('./fonts/NotoSans-Medium.ttf'),
  'NotoSans-SemiBold': require('./fonts/NotoSans-SemiBold.ttf'),
  'NotoSans-Bold': require('./fonts/NotoSans-Bold.ttf'),
  'NotoSans-Italic': require('./fonts/NotoSans-Italic.ttf'),
  'NotoSans-MediumItalic': require('./fonts/NotoSans-MediumItalic.ttf'),
  'NotoSans-SemiBoldItalic': require('./fonts/NotoSans-SemiBoldItalic.ttf'),
  'NotoSans-BoldItalic': require('./fonts/NotoSans-BoldItalic.ttf'),
} as const;
