import { colors, ColorScheme } from './colors';
import { spacing, borderRadius, typography } from './tokens';

export interface Theme {
  colors: ColorScheme;
  spacing: typeof spacing;
  borderRadius: typeof borderRadius;
  typography: typeof typography;
}

export const lightTheme: Theme = {
  colors: colors.light,
  spacing,
  borderRadius,
  typography,
};

export const darkTheme: Theme = {
  colors: colors.dark,
  spacing,
  borderRadius,
  typography,
};
