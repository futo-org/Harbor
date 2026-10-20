import { twemojiFontFamily } from '@/src/common/assets/twemojiFontFamily';
import { UITextView } from '@bsky.app/react-native-uitextview';
import { Children, type ReactNode } from 'react';
import { type TextProps as RNTextProps, StyleSheet } from 'react-native';
import {
  useTheme,
  typography,
  type FontWeightToken,
  type PaletteColorToken,
  type FontSizeToken,
  type LineHeightToken,
} from '@/src/common/theme';
import { splitEmoji } from '@/src/common/util/emoji';
import { isWeb } from '@/src/common/util/platform';

// Twemoji draws the emoji (see `app/+html.tsx`).
export const WEB_FONT_STACK =
  'NotoSans, Twemoji, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// Native font APIs can't select a variable font's weights, so each face is
// its own family (see `src/common/assets`). Keyed by every weight the theme
// can produce, so adding a token without a face fails to compile.
type FontWeightValue = (typeof typography.fontWeight)[FontWeightToken];
export const NATIVE_FONTS: Record<
  FontWeightValue,
  { normal: string; italic: string }
> = {
  '400': { normal: 'NotoSans-Regular', italic: 'NotoSans-Italic' },
  '500': { normal: 'NotoSans-Medium', italic: 'NotoSans-MediumItalic' },
  '600': { normal: 'NotoSans-SemiBold', italic: 'NotoSans-SemiBoldItalic' },
  '700': { normal: 'NotoSans-Bold', italic: 'NotoSans-BoldItalic' },
};

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
  italic?: boolean;
}

export function Text({
  variant = 'body',
  color,
  fontWeight,
  fontSize,
  lineHeight,
  italic,
  style,
  children,
  ...props
}: TextProps) {
  const { theme } = useTheme();

  const config = VARIANT_CONFIG[variant];
  const wantsItalic = italic && variant !== 'title' && variant !== 'subtitle';

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
    ? WEB_FONT_STACK
    : NATIVE_FONTS[resolvedFontWeight][wantsItalic ? 'italic' : 'normal'];

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
          ...(isWeb
            ? {
                fontWeight: resolvedFontWeight,
                ...(wantsItalic ? { fontStyle: 'italic' as const } : {}),
              }
            : {}),
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
