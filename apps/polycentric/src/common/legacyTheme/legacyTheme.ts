import { colors, ColorScheme } from './colors';
import { spacing, borderRadius, typography } from './tokens';

export interface LegacyTheme {
  colors: ColorScheme;
  spacing: typeof spacing;
  borderRadius: typeof borderRadius;
  typography: typeof typography;
}

export const legacyLightTheme: LegacyTheme = {
  colors: colors.light,
  spacing,
  borderRadius,
  typography,
};

export const legacyDarkTheme: LegacyTheme = {
  colors: colors.dark,
  spacing,
  borderRadius,
  typography,
};
