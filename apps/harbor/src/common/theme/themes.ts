import type { Palette } from './palette';
import { darkPalette, lightPalette } from './palette';
import { buildThemeColors } from './colors';
import { buildThemeColors as buildThemeColorsNew } from './colors_new';

// temporary: true runs the app on `colors_new`
const USE_NEW_COLORS = true;

export type ThemeScheme = 'light' | 'dark';

export type Theme = {
  scheme: ThemeScheme;
  colors: ReturnType<typeof buildThemeColors>['colors'];
  atoms: ReturnType<typeof buildThemeColors>['atoms'];
};

function createTheme(scheme: ThemeScheme, palette: Palette): Theme {
  if (USE_NEW_COLORS) return { scheme, ...buildThemeColorsNew(scheme) };
  return { scheme, ...buildThemeColors(palette, scheme) };
}

export const themes = {
  light: createTheme('light', lightPalette),
  dark: createTheme('dark', darkPalette),
} as const;

export type ThemePreference = keyof typeof themes | 'system';
