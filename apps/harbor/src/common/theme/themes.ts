import { buildThemeColors } from './colors';

export type ThemeScheme = 'light' | 'dark';

export type Theme = {
  scheme: ThemeScheme;
  colors: ReturnType<typeof buildThemeColors>['colors'];
  atoms: ReturnType<typeof buildThemeColors>['atoms'];
};

function createTheme(scheme: ThemeScheme): Theme {
  return { scheme, ...buildThemeColors(scheme) };
}

export const themes = {
  light: createTheme('light'),
  dark: createTheme('dark'),
} as const;

export type ThemePreference = keyof typeof themes | 'system';
