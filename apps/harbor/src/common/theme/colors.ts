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

export type TextColor = keyof Pick<
  ReturnType<typeof buildColorAtoms>,
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'accent'
  | 'danger'
  | 'success'
  | 'warning'
  | 'light'
  | 'dark'
>;

export function buildThemeColors(palette: Palette, scheme: ThemeScheme) {
  const colors = buildColors(palette, scheme);
  return { colors, atoms_new: buildColorAtoms(palette, scheme, colors) };
}

// raw strings for consumers that can't take a style object
function buildColors(palette: Palette, scheme: ThemeScheme) {
  return {
    primary: palette.neutral_900,
    secondary: palette.neutral_700,
    muted: palette.neutral_500,
    accent: palette.primary_500,
    // the 500 steps are too dark for text on the dark background
    danger: scheme === 'dark' ? palette.negative_600 : palette.negative_500,
    success: scheme === 'dark' ? palette.positive_600 : palette.positive_500,
    warning: palette.warning_500,
    // theme-independent, for text and icons on colored boxes and media
    light: palette.white,
    dark: palette.black,
    transparent: 'transparent',
  };
}

function buildColorAtoms(
  palette: Palette,
  scheme: ThemeScheme,
  colors: ReturnType<typeof buildColors>,
) {
  const shadowOpacity = SHADOW_OPACITY[scheme];

  return {
    primary: { color: colors.primary },
    secondary: { color: colors.secondary },
    muted: { color: colors.muted },
    accent: { color: colors.accent },
    danger: { color: colors.danger },
    success: { color: colors.success },
    warning: { color: colors.warning },
    light: { color: colors.light },
    dark: { color: colors.dark },
    box: {
      primary: buildBox(palette, scheme, palette.neutral_0, true),
      secondary: buildBox(palette, scheme, palette.neutral_25, true),
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
      bg: { backgroundColor: withOpacity(palette.black, 0.69) },
    },
    transparent: {
      bg: { backgroundColor: colors.transparent },
      border: { borderColor: colors.transparent },
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
  bg: string,
  primaryBorderVisible = false,
) {
  const bgSubtle = withOpacity(bg, SUBTLE_BOX_OPACITY);
  return {
    bg: { backgroundColor: bg },
    bg_subtle: { backgroundColor: bgSubtle },
    border: {
      borderColor: primaryBorderVisible ? shiftLightness(bg, scheme) : bg,
    },
    border_subtle: {
      // the border rule runs on what the subtle box looks like, so composite it first
      borderColor: shiftLightness(
        composite(bgSubtle, palette.neutral_0),
        scheme,
      ),
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
