import { palette } from './palette_new';
import type { ThemeScheme } from './themes';

export type TextColor = keyof Pick<
  ReturnType<typeof buildAtoms>,
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

// What differs between the themes. Both pick from the one palette: text and
// surfaces from opposite ends of the neutral scale, and a hover from the step
// next to its fill, on the text color's side.
const LIGHT_PICKS = {
  primary: palette.neutral_1000,
  secondary: palette.neutral_700,
  muted: palette.neutral_600,
  // the background, then two surfaces, each a step above the last
  surface_0: palette.neutral_0,
  surface_1: palette.neutral_50,
  surface_2: palette.neutral_100,
  hover: {
    neutral: palette.neutral_650,
    accent: palette.primary_600,
    danger: palette.negative_700,
    success: palette.positive_600,
    warning: palette.warning_450,
  },
};

const DARK_PICKS: typeof LIGHT_PICKS = {
  primary: palette.neutral_150,
  secondary: palette.neutral_400,
  muted: palette.neutral_650,
  surface_0: palette.neutral_1000,
  surface_1: palette.neutral_950,
  surface_2: palette.neutral_900,
  hover: {
    neutral: palette.neutral_550,
    accent: palette.primary_500,
    danger: palette.negative_600,
    success: palette.positive_500,
    warning: palette.warning_350,
  },
};

export function buildThemeColors(scheme: ThemeScheme) {
  const colors = buildColors(scheme === 'dark' ? DARK_PICKS : LIGHT_PICKS);
  return { colors, atoms: buildAtoms(scheme, colors) };
}

// raw strings for consumers that can't take a style object
function buildColors(picks: typeof LIGHT_PICKS) {
  return {
    primary: picks.primary,
    secondary: picks.secondary,
    muted: picks.muted,
    // each hue family's key color, the same in both themes
    accent: palette.primary_550,
    danger: palette.negative_650,
    success: palette.positive_550,
    warning: palette.warning_400,
    // theme-independent, for text and icons on colored boxes and media
    light: palette.white,
    dark: palette.black,
    transparent: 'transparent',
    // a neutral box's hover and border are the next surface
    box: {
      primary: buildBox(picks.surface_0, picks.surface_1, picks.surface_1),
      secondary: buildBox(picks.surface_1, picks.surface_2, picks.surface_2),
      neutral: buildBox(palette.neutral_600, picks.hover.neutral),
      accent: buildBox(palette.primary_550, picks.hover.accent),
      danger: buildBox(palette.negative_650, picks.hover.danger),
      success: buildBox(palette.positive_550, picks.hover.success),
      warning: buildBox(palette.warning_400, picks.hover.warning),
    },
    backdrop: {
      modal: withOpacity(palette.black, 0.45),
      media: withOpacity(palette.black, 0.92),
    },
    // controls on images; the box rules don't apply over media
    media_control: {
      bg: withOpacity(palette.black, 0.69),
    },
  };
}

// A hue box's solid border matches its fill, so it keeps the border width
// without a visible outline.
function buildBox(bg: string, hover: string, border = bg) {
  return {
    bg,
    bg_hover: hover,
    bg_subtle: withOpacity(bg, 0.125),
    bg_subtle_hover: withOpacity(bg, 0.2),
    border,
    border_subtle: withOpacity(bg, 0.3),
  };
}

function buildAtoms(
  scheme: ThemeScheme,
  colors: ReturnType<typeof buildColors>,
) {
  // shadows need more opacity to show on a dark background
  const shadowOpacity = scheme === 'dark' ? 0.25 : 0.16;
  const shadowGeometry = '0 6px 16px';

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
      primary: buildBoxAtoms(colors.box.primary),
      secondary: buildBoxAtoms(colors.box.secondary),
      neutral: buildBoxAtoms(colors.box.neutral),
      accent: buildBoxAtoms(colors.box.accent),
      danger: buildBoxAtoms(colors.box.danger),
      success: buildBoxAtoms(colors.box.success),
      warning: buildBoxAtoms(colors.box.warning),
    },
    backdrop: {
      modal: { backgroundColor: colors.backdrop.modal },
      media: { backgroundColor: colors.backdrop.media },
    },
    media_control: {
      bg: { backgroundColor: colors.media_control.bg },
    },
    transparent: {
      bg: { backgroundColor: colors.transparent },
      border: { borderColor: colors.transparent },
    },
    shadow: {
      accent: {
        boxShadow: `${shadowGeometry} ${withOpacity(palette.primary_550, shadowOpacity)}`,
      },
      neutral: {
        boxShadow: `${shadowGeometry} ${withOpacity(palette.black, shadowOpacity)}`,
      },
    },
  };
}

function buildBoxAtoms(box: ReturnType<typeof buildBox>) {
  return {
    bg: { backgroundColor: box.bg },
    bg_hover: { backgroundColor: box.bg_hover },
    bg_subtle: { backgroundColor: box.bg_subtle },
    bg_subtle_hover: { backgroundColor: box.bg_subtle_hover },
    border: { borderColor: box.border },
    border_subtle: { borderColor: box.border_subtle },
  };
}

// palette colors are #RRGGBB, so the alpha is a hex suffix: 0.125 -> '20'
function withOpacity(color: string, opacity: number): string {
  const alpha = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, '0');
  return color + alpha;
}
