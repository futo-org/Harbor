import type { Palette } from './palette';
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

export function buildThemeColors(palette: Palette, scheme: ThemeScheme) {
  const colors = buildColors(palette, scheme);
  return { colors, atoms: buildAtoms(palette, scheme, colors) };
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
    // for borders and dividers on any box
    outline: withOpacity(palette.neutral_500, 0.3),
    outline_strong: palette.neutral_500,
    // hover is the next palette step; the gray boxes' border is too
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
      // translucent, so it shows on the boxes under it
      raised: buildBox(
        withOpacity(palette.neutral_500, 0.125),
        withOpacity(palette.neutral_500, 0.2),
        withOpacity(palette.neutral_500, 0.3),
      ),
      accent: buildHueBox(palette.primary_500, palette.primary_600),
      danger: buildHueBox(palette.negative_500, palette.negative_600),
      success: buildHueBox(palette.positive_500, palette.positive_600),
      warning: buildHueBox(palette.warning_500, palette.warning_600),
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

function buildBox(bg: string, hover: string, border: string) {
  return { bg, bg_hover: hover, border };
}

// A hue box's solid border matches its fill, so it keeps the border width
// without a visible outline.
function buildHueBox(bg: string, hover: string) {
  return {
    ...buildBox(bg, hover, bg),
    bg_subtle: withOpacity(bg, 0.125),
    bg_subtle_hover: withOpacity(bg, 0.2),
    border_subtle: withOpacity(bg, 0.3),
  };
}

function buildAtoms(
  palette: Palette,
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
        boxShadow: `${shadowGeometry} ${withOpacity(palette.primary_900, shadowOpacity)}`,
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

// palette colors are #RRGGBB, so the alpha is a hex suffix: 0.125 -> '20'
function withOpacity(color: string, opacity: number): string {
  const alpha = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, '0');
  return color + alpha;
}
