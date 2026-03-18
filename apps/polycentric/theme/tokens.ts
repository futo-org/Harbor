export const spacing = {
  xs: 4,
  sm: 8,
  md: 10,
  lg: 15,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const borderRadius = {
  sm: 6,
  md: 8,
  lg: 12,
} as const;

export const typography = {
  fontSize: {
    xs: 12,
    sm: 14,
    md: 17,
    lg: 20,
    xl: 24,
  } as const,
  fontWeight: {
    regular: '400',
    semibold: '600',
    bold: '700',
  } as const,
  lineHeight: {
    xs: 16,
    sm: 20,
    md: 24,
    lg: 28,
    xl: 32,
  } as const,
} as const;

export type SpacingToken = keyof typeof spacing;
export type BorderRadiusToken = keyof typeof borderRadius;
export type FontSizeToken = keyof typeof typography.fontSize;
export type FontWeightToken = keyof typeof typography.fontWeight;
export type LineHeightToken = keyof typeof typography.lineHeight;
