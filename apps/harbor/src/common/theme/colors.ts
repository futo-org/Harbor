import {
  blend,
  clampChroma,
  converter,
  formatHex,
  formatHex8,
  parse,
} from 'culori';
import type { Palette } from './palette';
import type { ThemeScheme } from './themes';

const SUBTLE_BOX_OPACITY = 0.2;
// OKLCH lightness; borders go darker in light mode and lighter in dark mode
const BORDER_LIGHTNESS_SHIFT = 0.12;
const DISABLED_OPACITY = 0.4;
// offset and blur shared by all shadows
const SHADOW_GEOMETRY = '0 6px 16px';
// shadows need more opacity to show on a dark background
const SHADOW_OPACITY = { light: 0.16, dark: 0.25 };

export function buildThemeColors(palette: Palette, scheme: ThemeScheme) {
  const shadowOpacity = SHADOW_OPACITY[scheme];

  return {
    text: {
      primary: { color: palette.neutral_900 },
      secondary: { color: palette.neutral_700 },
      muted: { color: palette.neutral_500 },
      accent: { color: palette.primary_500 },
      danger: { color: palette.negative_500 },
      success: { color: palette.positive_500 },
      warning: { color: palette.warning_500 },
    },
    // theme-independent, for text and icons on colored boxes and media
    white: { color: palette.white },
    dark: { color: palette.black },
    box: {
      background: buildBox(palette, scheme, palette.neutral_0, true),
      background_inset: buildBox(palette, scheme, palette.neutral_25, true),
      neutral: buildBox(palette, scheme, palette.neutral_500),
      accent: buildBox(palette, scheme, palette.primary_500),
      danger: buildBox(palette, scheme, palette.negative_500),
      success: buildBox(palette, scheme, palette.positive_500),
      warning: buildBox(palette, scheme, palette.warning_500),
    },
    overlay: {
      hover: { backgroundColor: withOpacity(palette.neutral_900, 0.06) },
      pressed: { backgroundColor: withOpacity(palette.neutral_900, 0.12) },
      selected: { backgroundColor: withOpacity(palette.neutral_900, 0.12) },
      modal_backdrop: { backgroundColor: withOpacity(palette.black, 0.45) },
      media_backdrop: { backgroundColor: withOpacity(palette.black, 0.92) },
    },
    // controls on images; the box rules don't apply over media
    media_control: {
      fill: { backgroundColor: withOpacity(palette.black, 0.69) },
    },
    transparent: {
      fill: { backgroundColor: 'transparent' },
      border: { borderColor: 'transparent' },
    },
    shadow: {
      accent: {
        boxShadow: `${SHADOW_GEOMETRY} ${withOpacity(palette.primary_900, shadowOpacity)}`,
      },
      neutral: {
        boxShadow: `${SHADOW_GEOMETRY} ${withOpacity(palette.black, shadowOpacity)}`,
      },
    },
    disabled: { opacity: DISABLED_OPACITY },
  };
}

function buildBox(
  palette: Palette,
  scheme: ThemeScheme,
  fill: string,
  primaryBorderVisible = false,
) {
  const subtle = withOpacity(fill, SUBTLE_BOX_OPACITY);
  return {
    fill: { backgroundColor: fill },
    subtle: { backgroundColor: subtle },
    border: {
      borderColor: primaryBorderVisible ? shiftLightness(fill, scheme) : fill,
    },
    subtle_border: {
      // the border rule runs on what the subtle box looks like, so composite it first
      borderColor: shiftLightness(composite(subtle, palette.neutral_0), scheme),
    },
  };
}

const toOklch = converter('oklch');

function shiftLightness(color: string, scheme: ThemeScheme): string {
  const oklch = toOklch(parseColor(color));
  const shift =
    scheme === 'light' ? -BORDER_LIGHTNESS_SHIFT : BORDER_LIGHTNESS_SHIFT;
  const lightness = Math.min(1, Math.max(0, oklch.l + shift));
  return formatHex(clampChroma({ ...oklch, l: lightness }, 'oklch'));
}

function withOpacity(color: string, opacity: number): string {
  return formatHex8({ ...parseColor(color), alpha: opacity });
}

function composite(foreground: string, background: string): string {
  return formatHex(blend([parseColor(background), parseColor(foreground)]));
}

function parseColor(color: string) {
  const parsed = parse(color);
  if (!parsed) {
    throw new Error(`Invalid color: ${color}`);
  }
  return parsed;
}
