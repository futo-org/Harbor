import type { Palette } from './palette';
import type { ThemeScheme } from './themes';

const SUBTLE_BOX_OPACITY = 0.125;
const SUBTLE_BOX_HOVER_OPACITY = 0.2;
const SUBTLE_BORDER_OPACITY = 0.3;
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
    // hover is the next palette step; the neutral boxes' border is too
    box: {
      primary: buildBox(
        palette.neutral_0,
        palette.neutral_25,
        palette.neutral_25,
      ),
      secondary: buildBox(
        palette.neutral_25,
        palette.neutral_50,
        palette.neutral_50,
      ),
      neutral: buildBox(palette.neutral_500, palette.neutral_600),
      accent: buildBox(palette.primary_500, palette.primary_600),
      danger: buildBox(palette.negative_500, palette.negative_600),
      success: buildBox(palette.positive_500, palette.positive_600),
      warning: buildBox(palette.warning_500, palette.warning_600),
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

// A hue box's solid border matches its fill, so it keeps the border width
// without a visible outline.
function buildBox(bg: string, hover: string, border = bg) {
  return {
    bg: { backgroundColor: bg },
    bg_hover: { backgroundColor: hover },
    bg_subtle: { backgroundColor: withOpacity(bg, SUBTLE_BOX_OPACITY) },
    bg_subtle_hover: {
      backgroundColor: withOpacity(bg, SUBTLE_BOX_HOVER_OPACITY),
    },
    border: { borderColor: border },
    border_subtle: { borderColor: withOpacity(bg, SUBTLE_BORDER_OPACITY) },
  };
}

// palette colors are #RRGGBB, so the alpha is a hex suffix: 0.125 -> '20'
function withOpacity(color: string, opacity: number): string {
  const alpha = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, '0');
  return color + alpha;
}
