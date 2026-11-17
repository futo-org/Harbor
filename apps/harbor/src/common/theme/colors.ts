import { palette } from './palette';
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

const LIGHT_PICKS = {
  primary: palette.neutral_1000,
  secondary: palette.neutral_700,
  muted: palette.neutral_600,
  surface_0: palette.neutral_0,
  surface_1: palette.neutral_50,
  surface_2: palette.neutral_100,
  outline: palette.neutral_400,
  hover: {
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
  outline: palette.neutral_600,
  hover: {
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

    accent: palette.primary_550,
    danger: palette.negative_650,
    success: palette.positive_550,
    warning: palette.warning_400,

    light: palette.white,
    dark: palette.black,
    transparent: 'transparent',

    outline: withOpacity(picks.outline, 0.3),
    outline_strong: picks.outline,

    box: {
      primary: buildBox(picks.surface_0, picks.surface_1, picks.surface_1),
      secondary: buildBox(picks.surface_1, picks.surface_2, picks.surface_2),
      raised: buildBox(
        withOpacity(picks.outline, 0.125),
        withOpacity(picks.outline, 0.2),
        withOpacity(picks.outline, 0.3),
      ),
      accent: buildHueBox(palette.primary_550, picks.hover.accent),
      danger: buildHueBox(palette.negative_650, picks.hover.danger),
      success: buildHueBox(palette.positive_550, picks.hover.success),
      warning: buildHueBox(palette.warning_400, picks.hover.warning),
    },
    backdrop: {
      modal: withOpacity(palette.black, 0.45),
      media: withOpacity(palette.black, 0.92),
    },
    media_control: {
      bg: withOpacity(palette.black, 0.69),
    },
  };
}

function buildBox(bg: string, hover: string, border: string) {
  return { bg, bg_hover: hover, border };
}

function buildHueBox(bg: string, hover: string) {
  return {
    ...buildBox(bg, hover, bg),
    bg_subtle: withOpacity(bg, 0.125),
    bg_subtle_hover: withOpacity(bg, 0.2),
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
      raised: buildBoxAtoms(colors.box.raised),
      accent: buildHueBoxAtoms(colors.box.accent),
      danger: buildHueBoxAtoms(colors.box.danger),
      success: buildHueBoxAtoms(colors.box.success),
      warning: buildHueBoxAtoms(colors.box.warning),
    },
    backdrop: {
      modal: { backgroundColor: colors.backdrop.modal },
      media: { backgroundColor: colors.backdrop.media },
    },
    media_control: {
      bg: { backgroundColor: colors.media_control.bg },
    },
    outline: { borderColor: colors.outline },
    outline_strong: { borderColor: colors.outline_strong },
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
    border: { borderColor: box.border },
  };
}

function buildHueBoxAtoms(box: ReturnType<typeof buildHueBox>) {
  return {
    ...buildBoxAtoms(box),
    bg_subtle: { backgroundColor: box.bg_subtle },
    bg_subtle_hover: { backgroundColor: box.bg_subtle_hover },
    border_subtle: { borderColor: box.border_subtle },
  };
}

function withOpacity(color: string, opacity: number): string {
  const alpha = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, '0');
  return color + alpha;
}
