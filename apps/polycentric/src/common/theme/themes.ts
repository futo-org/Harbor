import type { TextStyle, ViewStyle } from 'react-native';
import type { Palette } from './palette';
import { darkPalette, lightPalette } from './palette';

export type ThemeAtoms = {
  text: TextStyle;
  text_neutral_low: TextStyle;
  text_neutral_medium: TextStyle;
  text_neutral_high: TextStyle;
  text_inverted: TextStyle;
  icon_accent: TextStyle;
  bg: ViewStyle;
  bg_neutral_25: ViewStyle;
  bg_neutral_50: ViewStyle;
  bg_neutral_100: ViewStyle;
  bg_neutral_200: ViewStyle;
  bg_neutral_300: ViewStyle;
  bg_neutral_400: ViewStyle;
  bg_neutral_500: ViewStyle;
  bg_neutral_600: ViewStyle;
  bg_neutral_700: ViewStyle;
  bg_neutral_800: ViewStyle;
  bg_neutral_900: ViewStyle;
  bg_neutral_950: ViewStyle;
  bg_neutral_975: ViewStyle;
  border_neutral_low: ViewStyle;
  border_neutral_medium: ViewStyle;
  border_neutral_high: ViewStyle;
  shadow_sm: ViewStyle;
  shadow_md: ViewStyle;
  shadow_lg: ViewStyle;
};

export type ThemeScheme = 'light' | 'dark';
export type ThemeName = 'light' | 'dark';

export type Theme = {
  scheme: ThemeScheme;
  name: ThemeName;
  palette: Palette;
  atoms: ThemeAtoms;
};

export function createTheme({
  scheme,
  name,
  palette,
}: {
  scheme: ThemeScheme;
  name: ThemeName;
  palette: Palette;
}): Theme {
  const shadowColor = palette.black;

  return {
    scheme,
    name,
    palette,
    atoms: {
      text: {
        color: palette.neutral_1000,
      },
      text_neutral_low: {
        color: palette.neutral_400,
      },
      text_neutral_medium: {
        color: palette.neutral_700,
      },
      text_neutral_high: {
        color: palette.neutral_900,
      },
      text_inverted: {
        color: palette.neutral_0,
      },
      icon_accent: {
        color: scheme === 'dark' ? palette.neutral_600 : palette.primary_600,
      },
      bg: {
        backgroundColor: palette.neutral_0,
      },
      bg_neutral_25: {
        backgroundColor: palette.neutral_25,
      },
      bg_neutral_50: {
        backgroundColor: palette.neutral_50,
      },
      bg_neutral_100: {
        backgroundColor: palette.neutral_100,
      },
      bg_neutral_200: {
        backgroundColor: palette.neutral_200,
      },
      bg_neutral_300: {
        backgroundColor: palette.neutral_300,
      },
      bg_neutral_400: {
        backgroundColor: palette.neutral_400,
      },
      bg_neutral_500: {
        backgroundColor: palette.neutral_500,
      },
      bg_neutral_600: {
        backgroundColor: palette.neutral_600,
      },
      bg_neutral_700: {
        backgroundColor: palette.neutral_700,
      },
      bg_neutral_800: {
        backgroundColor: palette.neutral_800,
      },
      bg_neutral_900: {
        backgroundColor: palette.neutral_900,
      },
      bg_neutral_950: {
        backgroundColor: palette.neutral_950,
      },
      bg_neutral_975: {
        backgroundColor: palette.neutral_975,
      },
      border_neutral_low: {
        borderColor: palette.neutral_100,
      },
      border_neutral_medium: {
        borderColor: palette.neutral_200,
      },
      border_neutral_high: {
        borderColor: palette.neutral_300,
      },
      shadow_sm: {
        boxShadow: `0 4px 6px -1px ${shadowColor}, 0 2px 4px -2px ${shadowColor}`,
      },
      shadow_md: {
        boxShadow: `0 10px 15px -3px ${shadowColor}, 0 4px 6px -4px ${shadowColor}`,
      },
      shadow_lg: {
        boxShadow: `0 20px 25px -5px ${shadowColor}, 0 8px 10px -6px ${shadowColor}`,
      },
    },
  };
}

export const themes = {
  light: createTheme({
    scheme: 'light',
    name: 'light',
    palette: lightPalette,
  }),
  dark: createTheme({
    scheme: 'dark',
    name: 'dark',
    palette: darkPalette,
  }),
} as const;

export type Themes = typeof themes;
export type ThemeKey = keyof Themes;
