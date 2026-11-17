import type { ThemeScheme } from '@/src/common/theme';

// An icon's color and its bubble's faint fill.
export interface TintColors {
  fg: string;
  bg: string;
}

// A category color (a platform's brand, a claim type's hue), per theme. These
// are fixed hexes rather than semantic tokens: they mark a category, not a
// state.
export type Tint = Record<ThemeScheme, TintColors>;

// Takes #RRGGBB hexes; `dark` is for colors that would vanish on the dark
// background.
export function buildTint(light: string, dark = light): Tint {
  // 12.5% alpha as a hex byte, like the theme's subtle fills
  return {
    light: { fg: light, bg: `${light}20` },
    dark: { fg: dark, bg: `${dark}20` },
  };
}
