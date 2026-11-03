import { twemojiFontFamily } from '@/src/common/assets/twemojiFontFamily';
import { UITextView } from '@bsky.app/react-native-uitextview';
import { Children, type ReactNode } from 'react';
import { StyleSheet, type TextProps as RNTextProps } from 'react-native';
import {
  type FontSizeToken,
  type FontWeightToken,
  type LineHeightToken,
  type PaletteColorToken,
  typography,
  useTheme,
} from '@/src/common/theme';
import { splitEmoji } from '@/src/common/util/emoji';
import { isWeb } from '@/src/common/util/platform';

// Twemoji draws the emoji (see `app/+html.tsx`).
export const WEB_FONT_STACK =
  'NotoSans, Twemoji, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const WEB_MONOSPACE_FONT_STACK = 'NotoSansMono, monospace';

export const NATIVE_FONT_FAMILY = 'Noto Sans';
export const NATIVE_MONOSPACE_FONT_FAMILY = 'Noto Sans Mono';

// Native text has no font fallback list, so emoji runs get the Twemoji
// family themselves.
function withTwemoji(text: string): ReactNode {
  const parts = splitEmoji(text);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 ? (
      // UITextView, so a selectable parent UITextView renders it as native text.
      // biome-ignore lint/suspicious/noArrayIndexKey: runs are positional, derived from the string
      <UITextView key={i} style={styles.twemoji}>
        {part}
      </UITextView>
    ) : (
      part
    ),
  );
}

function renderChildren(children: ReactNode): ReactNode {
  if (typeof children === 'string') return withTwemoji(children);
  if (!Array.isArray(children)) return children;
  return Children.map(children, (child) =>
    typeof child === 'string' ? withTwemoji(child) : child,
  );
}

export type TextVariant = 'title' | 'subtitle' | 'body' | 'secondary' | 'small';

interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: PaletteColorToken;
  fontWeight?: FontWeightToken;
  fontSize?: FontSizeToken | number;
  lineHeight?: LineHeightToken | number;
  monospace?: boolean;
}

export function Text({
  variant = 'body',
  color,
  fontWeight,
  fontSize,
  lineHeight,
  monospace = false,
  style,
  children,
  ...props
}: TextProps) {
  const { theme } = useTheme();

  const config = VARIANT_CONFIG[variant];

  const resolvedFontSize = fontSize
    ? typeof fontSize === 'number'
      ? fontSize
      : typography.fontSize[fontSize]
    : typography.fontSize[config.size];

  const resolvedLineHeight = lineHeight
    ? typeof lineHeight === 'number'
      ? lineHeight
      : typography.lineHeight[lineHeight]
    : typography.lineHeight[config.size];

  const resolvedFontWeight = fontWeight
    ? typography.fontWeight[fontWeight]
    : typography.fontWeight[config.defaultWeight];

  const fontFamily = isWeb
    ? monospace
      ? WEB_MONOSPACE_FONT_STACK
      : WEB_FONT_STACK
    : monospace
      ? NATIVE_MONOSPACE_FONT_FAMILY
      : NATIVE_FONT_FAMILY;

  return (
    <UITextView
      // iOS `selectable` Text only offers the copy callout; UITextView gives
      // real range selection. Everywhere else this renders the base Text.
      uiTextView={!!props.selectable}
      style={[
        {
          fontFamily,
          color: color ? theme.palette[color] : theme.palette.neutral_900,
          fontSize: resolvedFontSize,
          lineHeight: resolvedLineHeight,
          // Native sets the weight on the variable font's axis instead:
          // `fontWeight` would fake bold on Android, and iOS can't pick
          // NotoSansMono's weights by `fontWeight` (its file doesn't name
          // them). The string form, as the iOS UITextView only passes strings.
          ...(isWeb
            ? { fontWeight: resolvedFontWeight }
            : { fontVariationSettings: `'wght' ${resolvedFontWeight}` }),
        },
        style,
      ]}
      {...props}
    >
      {isWeb ? children : renderChildren(children)}
    </UITextView>
  );
}

export const VARIANT_CONFIG = {
  title: { size: 'lg', defaultWeight: 'bold' },
  subtitle: { size: 'lg', defaultWeight: 'semibold' },
  body: { size: 'md', defaultWeight: 'regular' },
  secondary: { size: 'md', defaultWeight: 'regular' },
  small: { size: 'xs', defaultWeight: 'semibold' },
} as const satisfies Record<
  TextVariant,
  { size: FontSizeToken; defaultWeight: FontWeightToken }
>;

export type TextVariantSize = (typeof VARIANT_CONFIG)[TextVariant]['size'];

const styles = StyleSheet.create({
  twemoji: { fontFamily: twemojiFontFamily },
});
