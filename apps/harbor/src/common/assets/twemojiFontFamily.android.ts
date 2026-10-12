import { Platform } from 'react-native';

// Embedded by the expo-font plugin in `app.config.ts`. Android draws COLR
// glyphs blank before 10 (API 29), so older versions get the bitmap (CBDT)
// build.
export const twemojiFontFamily =
  (Platform.Version as number) >= 29 ? 'Twemoji' : 'TwemojiCbdt';
