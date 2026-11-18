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

// the same in both themes
const SHARED_COLORS = {
  accent: palette.primary_550,
  danger: palette.negative_650,
  success: palette.positive_550,
  warning: palette.warning_400,

  light: palette.white,
  dark: palette.black,
  transparent: 'transparent',

  backdrop: {
    modal: withOpacity(palette.black, 0.45),
    media: withOpacity(palette.black, 0.92),
  },
  media_control: {
    bg: withOpacity(palette.black, 0.69),
  },
};

export function buildThemeColors(scheme: ThemeScheme) {
  const colors = scheme === 'dark' ? buildDarkColors() : buildLightColors();
  return { colors, atoms: buildAtoms(scheme, colors) };
}

// raw strings for consumers that can't take a style object
function buildLightColors() {
  return {
    ...SHARED_COLORS,
    primary: palette.neutral_1000,
    secondary: palette.neutral_700,
    muted: palette.neutral_600,

    outline: withOpacity(palette.neutral_400, 0.3),
    outline_strong: withOpacity(palette.neutral_550, 0.7),

    box: {
      primary: buildBox(
        palette.neutral_0,
        palette.neutral_50,
        palette.neutral_50,
      ),
      secondary: buildBox(
        palette.neutral_50,
        palette.neutral_100,
        palette.neutral_100,
      ),
      raised: buildBox(
        withOpacity(palette.neutral_400, 0.125),
        withOpacity(palette.neutral_400, 0.2),
        withOpacity(palette.neutral_400, 0.3),
      ),
      accent: buildHueBox(SHARED_COLORS.accent, palette.primary_600),
      danger: buildHueBox(SHARED_COLORS.danger, palette.negative_700),
      success: buildHueBox(SHARED_COLORS.success, palette.positive_600),
      warning: buildHueBox(SHARED_COLORS.warning, palette.warning_450),
    },
  };
}

function buildDarkColors(): ReturnType<typeof buildLightColors> {
  return {
    ...SHARED_COLORS,
    primary: palette.neutral_150,
    secondary: palette.neutral_400,
    muted: palette.neutral_650,

    outline: withOpacity(palette.neutral_600, 0.3),
    outline_strong: withOpacity(palette.neutral_550, 0.9),

    box: {
      primary: buildBox(
        palette.neutral_1000,
        palette.neutral_950,
        palette.neutral_950,
      ),
      secondary: buildBox(
        palette.neutral_950,
        palette.neutral_900,
        palette.neutral_900,
      ),
      raised: buildBox(
        withOpacity(palette.neutral_600, 0.125),
        withOpacity(palette.neutral_600, 0.2),
        withOpacity(palette.neutral_600, 0.3),
      ),
      accent: buildHueBox(SHARED_COLORS.accent, palette.primary_500),
      danger: buildHueBox(SHARED_COLORS.danger, palette.negative_600),
      success: buildHueBox(SHARED_COLORS.success, palette.positive_500),
      warning: buildHueBox(SHARED_COLORS.warning, palette.warning_350),
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
  colors: ReturnType<typeof buildLightColors>,
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
