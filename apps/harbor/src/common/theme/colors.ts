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

export function buildThemeColors(palette: Palette, scheme: ThemeScheme) {
  return {
    text: {
      primary: palette.neutral_900,
      secondary: palette.neutral_700,
      muted: palette.neutral_500,
      accent: palette.primary_500,
      danger: palette.negative_500,
      success: palette.positive_500,
      warning: palette.warning_500,
    },
    box: {
      background: buildBox(
        palette,
        scheme,
        palette.neutral_0,
        palette.neutral_900,
      ),
      background_inset: buildBox(
        palette,
        scheme,
        palette.neutral_25,
        palette.neutral_900,
      ),
      neutral: buildBox(palette, scheme, palette.neutral_500, palette.white),
      accent: buildBox(palette, scheme, palette.primary_500, palette.white),
      danger: buildBox(palette, scheme, palette.negative_500, palette.white),
      success: buildBox(palette, scheme, palette.positive_500, palette.white),
      warning: buildBox(palette, scheme, palette.warning_500, palette.white),
    },
    overlay: {
      hover: withOpacity(palette.neutral_900, 0.06),
      pressed: withOpacity(palette.neutral_900, 0.12),
      selected: withOpacity(palette.neutral_900, 0.12),
      modal_backdrop: withOpacity(palette.black, 0.45),
      media_backdrop: withOpacity(palette.black, 0.92),
    },
    // controls on images; the box rules don't apply over media
    media_control: {
      fill: withOpacity(palette.black, 0.69),
      on: palette.white,
    },
    shadow: withOpacity(palette.black, 0.12),
    disabled: { opacity: DISABLED_OPACITY },
  };
}

function buildBox(
  palette: Palette,
  scheme: ThemeScheme,
  fill: string,
  on: string,
) {
  const subtle = withOpacity(fill, SUBTLE_BOX_OPACITY);
  return {
    fill,
    subtle,
    border: shiftLightness(fill, scheme),
    // the border rule runs on what the subtle box looks like, so composite it first
    subtle_border: shiftLightness(composite(subtle, palette.neutral_0), scheme),
    // text and icons on `fill`
    on,
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
